import os
import shutil
from pathlib import Path

DATA_DIR = r"C:/Users/kelvin/Downloads/archive/BraTS2021_Training_Data"
OUT_DIR  = r"C:/Users/kelvin/Downloads/brats_workspace/kaist_pred_A"
IN_DIR   = r"C:/Users/kelvin/Downloads/brats_workspace/nnunet_inputs"
VIEW_DIR = r"C:/Users/kelvin/Downloads/brats_web"
WEB_DATA = os.path.join(VIEW_DIR, "data")

mods = ["t1","t1ce","t2","flair"]

MOD_TO_IDX = {"t1":0, "t1ce":1, "t2":2, "flair":3}

def safe_copy(src, dst):
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

def find_gt(case_id):
    p = Path(DATA_DIR) / case_id / f"{case_id}_seg.nii.gz"
    return str(p) if p.exists() else None

def main():
    Path(WEB_DATA).mkdir(parents=True, exist_ok=True)

    base = Path(IN_DIR)
    cases = sorted({p.name.split("_")[0] + "_" + p.name.split("_")[1]
                    for p in base.glob("BraTS2021_*_0000.nii.gz")})

    if not cases:
        print("No BraTS2021_*_0000.nii.gz files found under nnunet_inputs")
        return

    print(f"Found {len(cases)} cases. Copying to {WEB_DATA}")

    for case_id in cases:

        for m in mods:
            idx = MOD_TO_IDX[m]
            src = base / f"{case_id}_{idx:04d}.nii.gz"
            if not src.exists():
                print(f"[WARN] missing modality: {src}")
                continue
            dst = Path(WEB_DATA) / f"{case_id}_{m}.nii.gz"
            safe_copy(str(src), str(dst))

        gt = find_gt(case_id)
        if gt:
            dst = Path(WEB_DATA) / f"{case_id}_gt.nii.gz"
            safe_copy(gt, str(dst))
        else:
            print(f"[WARN] GT not found for {case_id}")

        pred = Path(OUT_DIR) / f"{case_id}.nii.gz"
        if pred.exists():
            dst = Path(WEB_DATA) / f"{case_id}_pred.nii.gz"
            safe_copy(str(pred), str(dst))
        else:
            print(f"[WARN] Pred not found for {case_id}")

    print("Done ✅")

if __name__ == "__main__":
    main()
