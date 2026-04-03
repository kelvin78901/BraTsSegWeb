import os, json, shutil
from pathlib import Path

import numpy as np

import nibabel as nib

DATA_DIR = r"C:\Users\kelvin\Downloads\archive\BraTS2021_Training_Data"
OUT_DIR  = r"C:\Users\kelvin\Downloads\brats_workspace\kaist_pred_A"
WEB_DIR  = r"C:\Users\kelvin\Downloads\brats_web"

LIMIT_CASES = 10

MODS = {
    "t1": "t1",
    "t1ce": "t1ce",
    "t2": "t2",
    "flair": "flair"
}

DATA_OUT = Path(WEB_DIR) / "data"
DATA_OUT.mkdir(parents=True, exist_ok=True)

def load_nii(path):
    img = nib.load(path)
    data = img.get_fdata(dtype=np.float32)
    return img, data

def save_copy(src, dst):
    src = Path(src)
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

def mask_regions_brats(label_vol):
    """
    BraTS labels: 0,1,2,4
    Regions:
      WT (whole tumor) = {1,2,4}
      TC (tumor core)  = {1,4}
      ET (enhancing)   = {4}
    """
    wt = np.isin(label_vol, [1,2,4]).astype(np.uint8)
    tc = np.isin(label_vol, [1,4]).astype(np.uint8)
    et = (label_vol == 4).astype(np.uint8)
    return {"WT": wt, "TC": tc, "ET": et}

def compute_metrics_binary(gt, pr):
    gt = gt.astype(bool)
    pr = pr.astype(bool)
    tp = np.logical_and(gt, pr).sum()
    fp = np.logical_and(~gt, pr).sum()
    fn = np.logical_and(gt, ~pr).sum()
    tn = np.logical_and(~gt, ~pr).sum()

    dice = (2*tp) / (2*tp + fp + fn + 1e-8)
    iou  = tp / (tp + fp + fn + 1e-8)
    prec = tp / (tp + fp + 1e-8)
    rec  = tp / (tp + fn + 1e-8)

    return {
        "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
        "dice": float(dice), "iou": float(iou),
        "precision": float(prec), "recall": float(rec)
    }

def main():
    cases = sorted([d for d in os.listdir(DATA_DIR) if d.startswith("BraTS2021_") and os.path.isdir(os.path.join(DATA_DIR, d))])
    from gif_utils import merge_two_gif

    if LIMIT_CASES is not None:
        cases = cases[:LIMIT_CASES]

    available = []

    for cid in cases:
        case_dir = Path(DATA_DIR) / cid

        gt_path = case_dir / f"{cid}_seg.nii.gz"
        if not gt_path.exists():
            print("[skip] GT not found:", gt_path)
            continue

        pred_path = Path(OUT_DIR) / f"{cid}.nii.gz"
        if not pred_path.exists():
            print("[skip] Pred not found:", pred_path)
            continue

        mod_paths = {}
        ok_mod = True
        for k, suffix in MODS.items():
            p = case_dir / f"{cid}_{suffix}.nii.gz"
            if not p.exists():
                ok_mod = False
                print("[skip] modality not found:", p)
                break
            mod_paths[k] = p
        if not ok_mod:
            continue

        out_case = DATA_OUT / cid
        out_case.mkdir(parents=True, exist_ok=True)

        for k, p in mod_paths.items():
            save_copy(str(p), str(out_case / f"{k}.nii.gz"))

        save_copy(str(gt_path), str(out_case / "gt.nii.gz"))
        save_copy(str(pred_path), str(out_case / "pred.nii.gz"))

        _, gt = load_nii(str(gt_path))
        _, pr = load_nii(str(pred_path))

        gt = gt.astype(np.int16)
        pr = np.rint(pr).astype(np.int16)

        gt_regions = mask_regions_brats(gt)
        pr_regions = mask_regions_brats(pr)

        metrics = {"case": cid, "regions": {}}
        for r in ["WT", "TC", "ET"]:
            metrics["regions"][r] = compute_metrics_binary(gt_regions[r], pr_regions[r])

        with open(out_case / "metrics.json", "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)

        available.append(cid)
        print("[ok]", cid)

    with open(DATA_OUT / "index.json", "w", encoding="utf-8") as f:
        json.dump(available, f, indent=2)

    print("\nDone.")
    print("Cases exported:", len(available))
    print("Open:", r"http://127.0.0.1:8000/index.html")

if __name__ == "__main__":
    main()
