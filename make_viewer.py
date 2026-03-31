import os
import shutil
from pathlib import Path

# ====== 你自己的路径（按你之前给的）======
DATA_DIR = r"C:/Users/kelvin/Downloads/archive/BraTS2021_Training_Data"   # 原始BraTS训练集(含GT)
OUT_DIR  = r"C:/Users/kelvin/Downloads/brats_workspace/kaist_pred_A"      # 预测mask输出
IN_DIR   = r"C:/Users/kelvin/Downloads/brats_workspace/nnunet_inputs"     # nnUNet输入4模态（*_0000..0003）
VIEW_DIR = r"C:/Users/kelvin/Downloads/brats_web"
WEB_DATA = os.path.join(VIEW_DIR, "data")

mods = ["t1","t1ce","t2","flair"]  # 对应 nnunet_inputs 的 _0000,_0001,_0002,_0003

# nnUNet 四模态索引（BraTS常用）
MOD_TO_IDX = {"t1":0, "t1ce":1, "t2":2, "flair":3}

def safe_copy(src, dst):
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

def find_gt(case_id):
    """
    训练集GT常见路径：
    BraTS2021_Training_Data/BraTS2021_00000/BraTS2021_00000_seg.nii.gz
    """
    p = Path(DATA_DIR) / case_id / f"{case_id}_seg.nii.gz"
    return str(p) if p.exists() else None

def main():
    Path(WEB_DATA).mkdir(parents=True, exist_ok=True)

    # 扫描 nnunet_inputs 里有哪些 case（根据 *_0000.nii.gz）
    base = Path(IN_DIR)
    cases = sorted({p.name.split("_")[0] + "_" + p.name.split("_")[1]
                    for p in base.glob("BraTS2021_*_0000.nii.gz")})

    if not cases:
        print("没找到 nnunet_inputs 下的 BraTS2021_*_0000.nii.gz")
        return

    print(f"Found {len(cases)} cases. Copying to {WEB_DATA}")

    for case_id in cases:
        # 复制 4 模态
        for m in mods:
            idx = MOD_TO_IDX[m]
            src = base / f"{case_id}_{idx:04d}.nii.gz"
            if not src.exists():
                print(f"[WARN] missing modality: {src}")
                continue
            dst = Path(WEB_DATA) / f"{case_id}_{m}.nii.gz"
            safe_copy(str(src), str(dst))

        # 复制 GT（如果有）
        gt = find_gt(case_id)
        if gt:
            dst = Path(WEB_DATA) / f"{case_id}_gt.nii.gz"
            safe_copy(gt, str(dst))
        else:
            print(f"[WARN] GT not found for {case_id}")

        # 复制 Pred（如果有）
        pred = Path(OUT_DIR) / f"{case_id}.nii.gz"
        if pred.exists():
            dst = Path(WEB_DATA) / f"{case_id}_pred.nii.gz"
            safe_copy(str(pred), str(dst))
        else:
            print(f"[WARN] Pred not found for {case_id}")

    print("Done ✅")

if __name__ == "__main__":
    main()
