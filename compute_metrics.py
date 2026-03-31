# compute_metrics.py
# -*- coding: utf-8 -*-

import json
from pathlib import Path

import numpy as np
import nibabel as nib

# optional but recommended for csv
import pandas as pd


THIS_DIR = Path(__file__).resolve().parent
VIEWER_DIR = THIS_DIR / "viewer"
CASES_DIR = VIEWER_DIR / "cases"
INDEX_JSON = CASES_DIR / "index.json"

# BraTS derived regions
# WT = whole tumor = 1|2|4
# TC = tumor core = 1|4
# ET = enhancing tumor = 4


def load_nii(path: Path) -> np.ndarray:
    img = nib.load(str(path))
    data = img.get_fdata(dtype=np.float32)
    if data.ndim != 3:
        raise ValueError(f"Expected 3D nifti, got shape={data.shape} from {path}")
    return data


def bin_mask(seg: np.ndarray, labels) -> np.ndarray:
    labels = list(labels)
    m = np.zeros(seg.shape, dtype=bool)
    for lb in labels:
        m |= (seg == lb)
    return m


def dice_iou(a: np.ndarray, b: np.ndarray):
    # a,b: bool arrays
    a = a.astype(bool)
    b = b.astype(bool)
    inter = np.logical_and(a, b).sum(dtype=np.int64)
    sa = a.sum(dtype=np.int64)
    sb = b.sum(dtype=np.int64)
    union = np.logical_or(a, b).sum(dtype=np.int64)

    # define: if both empty => perfect
    if sa == 0 and sb == 0:
        return 1.0, 1.0

    dice = (2.0 * inter) / (sa + sb + 1e-8)
    iou = inter / (union + 1e-8)
    return float(dice), float(iou)


def compute_one_case(gt_path: Path, pred_path: Path):
    gt = load_nii(gt_path).astype(np.int16)
    pred = load_nii(pred_path).astype(np.int16)

    if gt.shape != pred.shape:
        raise ValueError(f"Shape mismatch: gt={gt.shape}, pred={pred.shape}")

    metrics = {}

    # per label
    for lb in [1, 2, 4]:
        g = (gt == lb)
        p = (pred == lb)
        d, j = dice_iou(g, p)
        metrics[f"label_{lb}_dice"] = d
        metrics[f"label_{lb}_iou"] = j

    # BraTS regions
    wt_g = bin_mask(gt, [1, 2, 4])
    wt_p = bin_mask(pred, [1, 2, 4])
    d, j = dice_iou(wt_g, wt_p)
    metrics["WT_dice"] = d
    metrics["WT_iou"] = j

    tc_g = bin_mask(gt, [1, 4])
    tc_p = bin_mask(pred, [1, 4])
    d, j = dice_iou(tc_g, tc_p)
    metrics["TC_dice"] = d
    metrics["TC_iou"] = j

    et_g = bin_mask(gt, [4])
    et_p = bin_mask(pred, [4])
    d, j = dice_iou(et_g, et_p)
    metrics["ET_dice"] = d
    metrics["ET_iou"] = j

    # voxel counts (handy for debugging)
    metrics["gt_nonzero_voxels"] = int((gt != 0).sum())
    metrics["pred_nonzero_voxels"] = int((pred != 0).sum())

    return metrics


def main():
    if not INDEX_JSON.exists():
        raise FileNotFoundError(f"index.json not found: {INDEX_JSON}. Run build_cases.py first.")

    items = json.loads(INDEX_JSON.read_text(encoding="utf-8"))
    if not items:
        print("No cases in index.json")
        return

    rows = []
    for it in items:
        cid = it["case_id"]
        case_dir = CASES_DIR / cid
        gt = case_dir / "gt.nii.gz"
        pred = case_dir / "pred.nii.gz"

        if not gt.exists() or not pred.exists():
            print(f"[SKIP] {cid}: missing gt/pred")
            continue

        try:
            m = compute_one_case(gt, pred)
        except Exception as e:
            print(f"[ERR ] {cid}: {e}")
            continue

        # save per-case metrics.json
        out_json = case_dir / "metrics.json"
        out_json.write_text(json.dumps(m, indent=2), encoding="utf-8")
        print(f"[OK  ] {cid}: wrote {out_json.name}")

        row = {"case_id": cid, **m}
        rows.append(row)

    if not rows:
        print("No metrics computed.")
        return

    df = pd.DataFrame(rows).sort_values("case_id")

    # summary stats
    summary = {}
    for col in df.columns:
        if col == "case_id":
            continue
        if np.issubdtype(df[col].dtype, np.number):
            summary[col] = {
                "mean": float(df[col].mean()),
                "std": float(df[col].std(ddof=0)),
                "min": float(df[col].min()),
                "max": float(df[col].max()),
            }

    (CASES_DIR / "metrics_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    df.to_csv(CASES_DIR / "metrics_summary.csv", index=False, encoding="utf-8-sig")

    print("\nDone.")
    print(f"- Per-case: viewer/cases/<CASE_ID>/metrics.json")
    print(f"- Summary : viewer/cases/metrics_summary.json")
    print(f"- CSV     : viewer/cases/metrics_summary.csv")


if __name__ == "__main__":
    main()
