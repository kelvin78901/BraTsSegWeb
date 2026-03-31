"""
One-time script: convert MONAI SegResNet BraTS checkpoint → ONNX.

Run this on your **dev machine** (needs torch + monai) before deploying:

    python export_onnx.py \
        --model-path models/monai_brats/model.pt \
        --output    models/monai_brats/model.onnx \
        --model-url https://huggingface.co/MONAI/brats_mri_segmentation/resolve/main/models/model.pt

The generated .onnx file is all you need on the server — no torch/monai required.
"""

import argparse
import os
import urllib.request

import torch
from monai.networks.nets import SegResNet


def ensure_weights(path: str, url: str):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    print(f"Downloading weights → {path}")
    urllib.request.urlretrieve(url, path)


def main():
    parser = argparse.ArgumentParser(description="Export MONAI SegResNet to ONNX")
    parser.add_argument("--model-path", required=True, help="Path to .pt checkpoint")
    parser.add_argument("--model-url", default="", help="Download URL if checkpoint missing")
    parser.add_argument("--output", required=True, help="Output .onnx path")
    parser.add_argument("--roi", default="240,240,160", help="ROI size H,W,D for dummy input")
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    args = parser.parse_args()

    if args.model_url:
        ensure_weights(args.model_path, args.model_url)

    # Build model identical to open_brats_infer.py
    net = SegResNet(
        blocks_down=[1, 2, 2, 4],
        blocks_up=[1, 1, 1],
        init_filters=16,
        in_channels=4,
        out_channels=3,
        dropout_prob=0.2,
    )
    net.eval()

    ckpt = torch.load(args.model_path, map_location="cpu")
    state = ckpt.get("model", ckpt)
    net.load_state_dict(state)
    print("Loaded checkpoint OK")

    roi = [int(x) for x in args.roi.split(",")]
    dummy = torch.randn(1, 4, *roi)

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    torch.onnx.export(
        net,
        dummy,
        args.output,
        opset_version=args.opset,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={
            "input":  {0: "batch", 2: "H", 3: "W", 4: "D"},
            "logits": {0: "batch", 2: "H", 3: "W", 4: "D"},
        },
        dynamo=False,   # force legacy TorchScript export (compatible with plain onnxruntime)
    )
    size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"Exported → {args.output}  ({size_mb:.1f} MB, opset {args.opset})")


if __name__ == "__main__":
    main()
