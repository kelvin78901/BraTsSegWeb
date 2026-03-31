import argparse
import os
import urllib.request

import nibabel as nib
import numpy as np


def _lazy_import_torch_monai():
    try:
        import torch
        from monai.inferers import SlidingWindowInferer
        from monai.networks.nets import SegResNet
        from monai.transforms import NormalizeIntensity
        return torch, SlidingWindowInferer, SegResNet, NormalizeIntensity
    except Exception as exc:
        raise RuntimeError(
            "Missing dependencies for open model inference. Install with: pip install torch monai"
        ) from exc


def ensure_weights(model_path: str, model_url: str):
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    if os.path.exists(model_path) and os.path.getsize(model_path) > 0:
        return
    urllib.request.urlretrieve(model_url, model_path)


def load_flair_to_4ch(input_nii_path: str):
    img = nib.load(input_nii_path)
    flair = img.get_fdata(dtype=np.float32)
    if flair.ndim != 3:
        raise RuntimeError(f"Expected 3D MRI volume, got shape={flair.shape}")
    x = np.stack([flair, flair, flair, flair], axis=0)
    return img, x


def run_open_model(input_nii_path: str, output_pred_path: str, model_path: str):
    torch, SlidingWindowInferer, SegResNet, NormalizeIntensity = _lazy_import_torch_monai()

    ref_img, vol4 = load_flair_to_4ch(input_nii_path)
    vol_t = torch.from_numpy(vol4).unsqueeze(0)

    normalizer = NormalizeIntensity(nonzero=True, channel_wise=True)
    vol_t = normalizer(vol_t)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    vol_t = vol_t.to(device)

    net = SegResNet(
        blocks_down=[1, 2, 2, 4],
        blocks_up=[1, 1, 1],
        init_filters=16,
        in_channels=4,
        out_channels=3,
        dropout_prob=0.2,
    ).to(device)
    net.eval()

    ckpt = torch.load(model_path, map_location=device)
    state = ckpt.get("model", ckpt)
    net.load_state_dict(state)

    inferer = SlidingWindowInferer(roi_size=(240, 240, 160), sw_batch_size=1, overlap=0.5)

    with torch.no_grad():
        logits = inferer(vol_t, net)
        probs = torch.sigmoid(logits)
        pred = (probs > 0.5).to(torch.uint8)[0]

        tc = pred[0] > 0
        wt = pred[1] > 0
        et = pred[2] > 0

        out = torch.zeros_like(pred[0], dtype=torch.uint8)
        out = torch.where(wt, torch.tensor(2, dtype=torch.uint8, device=out.device), out)
        out = torch.where(tc, torch.tensor(1, dtype=torch.uint8, device=out.device), out)
        out = torch.where(et, torch.tensor(4, dtype=torch.uint8, device=out.device), out)

    out_np = out.detach().cpu().numpy().astype(np.uint8)
    nib.save(nib.Nifti1Image(out_np, affine=ref_img.affine, header=ref_img.header), output_pred_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--model-url", required=True)
    args = parser.parse_args()

    ensure_weights(args.model_path, args.model_url)
    run_open_model(args.input, args.output, args.model_path)


if __name__ == "__main__":
    main()
