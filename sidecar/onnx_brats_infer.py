"""
ONNX Runtime BraTS inference — CPU only, no PyTorch / MONAI required.
Optimised for **low-memory** servers (≥ 2 GB RAM).

Usage (standalone):
    python onnx_brats_infer.py \
        --input  /path/to/flair.nii.gz \
        --output /path/to/pred.nii.gz \
        --model-path models/monai_brats/model.onnx

Dependencies: onnxruntime, numpy, nibabel, scipy
"""

import argparse
import gc
import itertools
import math
import os

import nibabel as nib
import numpy as np

def _compute_windows(vol_shape, roi_size, overlap=0.25):
    """Yield (start, end) tuples for each sliding-window position."""
    starts_per_axis = []
    for s, r in zip(vol_shape, roi_size):
        if s <= r:
            starts_per_axis.append([0])
            continue
        step = max(1, int(r * (1 - overlap)))
        starts = list(range(0, s - r, step))
        if starts[-1] + r < s:
            starts.append(s - r)
        starts_per_axis.append(starts)

    for combo in itertools.product(*starts_per_axis):
        start = list(combo)
        end = [s + r for s, r in zip(start, roi_size)]
        yield start, end

def _pad_to_roi(vol: np.ndarray, roi_size):
    """Zero-pad volume so each spatial dim >= roi_size."""
    pads = []
    for i, (vs, rs) in enumerate(zip(vol.shape[1:], roi_size)):
        deficit = max(0, rs - vs)
        pads.append((0, deficit))
    if all(p == (0, 0) for p in pads):
        return vol, None
    pad_widths = [(0, 0)] + pads
    padded = np.pad(vol, pad_widths, mode="constant", constant_values=0)
    return padded, pads

def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))

def sliding_window_inference(session, vol_4ch: np.ndarray,
                             roi_size=(128, 128, 128), overlap=0.25):
    """
    Run ONNX model with sliding window over a 4-channel volume.
    Memory-optimised: small ROI, low overlap, uniform weighting.

    Parameters
    ----------
    session : onnxruntime.InferenceSession
    vol_4ch : (4, H, W, D) float32 — normalised input
    roi_size : tuple
    overlap  : float

    Returns
    -------
    pred : (H, W, D) uint8 — label map {0, 1, 2, 4}
    """
    vol, pad_info = _pad_to_roi(vol_4ch, roi_size)
    spatial = vol.shape[1:]

    accum = np.zeros((3,) + spatial, dtype=np.float32)
    count = np.zeros(spatial, dtype=np.float32)

    input_name = session.get_inputs()[0].name

    windows = list(_compute_windows(spatial, roi_size, overlap))
    total = len(windows)
    for idx, (start, end) in enumerate(windows, 1):
        patch = vol[:, start[0]:end[0], start[1]:end[1], start[2]:end[2]]
        inp = patch[np.newaxis].astype(np.float32)
        logits = session.run(None, {input_name: inp})[0][0]
        del inp

        accum[:, start[0]:end[0], start[1]:end[1], start[2]:end[2]] += logits
        count[start[0]:end[0], start[1]:end[1], start[2]:end[2]] += 1.0
        del logits

        if idx % 5 == 0 or idx == total:
            print(f"  Window {idx}/{total}")

    count = np.maximum(count, 1e-8)
    accum /= count[np.newaxis]
    del count

    probs = _sigmoid(accum)
    del accum
    gc.collect()

    pred_bin = (probs > 0.5).astype(np.uint8)
    del probs

    out = np.zeros(spatial, dtype=np.uint8)
    out[pred_bin[1] > 0] = 2
    out[pred_bin[0] > 0] = 1
    out[pred_bin[2] > 0] = 4
    del pred_bin

    if pad_info is not None:
        orig_slices = tuple(
            slice(0, vol_4ch.shape[i + 1]) for i in range(3)
        )
        out = out[orig_slices]

    return out

def load_flair_to_4ch(input_nii_path: str):
    """Load a single-channel FLAIR NIfTI and replicate to 4 channels."""
    img = nib.load(input_nii_path)
    flair = img.get_fdata(dtype=np.float32)
    if flair.ndim != 3:
        raise RuntimeError(f"Expected 3D volume, got shape={flair.shape}")
    vol = np.stack([flair, flair, flair, flair], axis=0)
    return img, vol

def normalize_nonzero_channelwise(vol: np.ndarray) -> np.ndarray:
    """NormalizeIntensity(nonzero=True, channel_wise=True) equivalent."""
    out = vol.copy()
    for c in range(vol.shape[0]):
        ch = out[c]
        mask = ch != 0
        if mask.any():
            vals = ch[mask]
            mean = vals.mean()
            std = vals.std()
            if std > 1e-8:
                ch[mask] = (vals - mean) / std
    return out

def run_onnx_inference(input_nii_path: str, output_pred_path: str,
                       model_path: str, roi_size=(128, 128, 128)):
    import onnxruntime as ort

    ref_img, vol4 = load_flair_to_4ch(input_nii_path)
    vol4 = normalize_nonzero_channelwise(vol4)

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = min(2, os.cpu_count() or 1)
    opts.inter_op_num_threads = 1
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    opts.enable_cpu_mem_arena = False

    sess = ort.InferenceSession(model_path, sess_options=opts,
                                providers=["CPUExecutionProvider"])

    pred = sliding_window_inference(sess, vol4, roi_size=roi_size, overlap=0.25)
    del vol4, sess
    gc.collect()

    nib.save(
        nib.Nifti1Image(pred, affine=ref_img.affine, header=ref_img.header),
        output_pred_path,
    )
    print(f"Saved prediction → {output_pred_path}  shape={pred.shape}")

def main():
    parser = argparse.ArgumentParser(description="BraTS ONNX inference (CPU)")
    parser.add_argument("--input", required=True, help=".nii.gz FLAIR volume")
    parser.add_argument("--output", required=True, help="Output pred .nii.gz")
    parser.add_argument("--model-path", required=True, help="Path to .onnx model")
    parser.add_argument("--roi", default="240,240,160", help="ROI H,W,D")
    args = parser.parse_args()

    roi = tuple(int(x) for x in args.roi.split(","))
    run_onnx_inference(args.input, args.output, args.model_path, roi_size=roi)

if __name__ == "__main__":
    main()
