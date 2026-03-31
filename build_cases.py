# build_cases.py
# -*- coding: utf-8 -*-

import os
import re
import json
import shutil
from pathlib import Path

# =========================
# Paths (EDIT if needed)
# =========================
DATA_DIR = r"C:\Users\kelvin\Downloads\archive\BraTS2021_Training_Data"   # official BraTS folder (has GT seg)
BASE_WS  = r"C:\Users\kelvin\Downloads\brats_workspace"                  # nnUNet workspace

NN_INPUT_BASE = os.path.join(BASE_WS, "nnunet_inputs")                   # has *_0000..*_0003.nii.gz
PRED_DIR      = os.path.join(BASE_WS, "kaist_pred_A")                    # has BraTS2021_00000.nii.gz, ...

# output inside brats_web/
THIS_DIR   = Path(__file__).resolve().parent
VIEWER_DIR = THIS_DIR / "viewer"
CASES_DIR  = VIEWER_DIR / "cases"

# name mapping for modalities
MOD_MAP = {
    0: "t1",
    1: "t1ce",
    2: "t2",
    3: "flair"
}

CASE_RE = re.compile(r"^(BraTS2021_\d{5})_000[0-3]\.nii\.gz$", re.IGNORECASE)


def safe_copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(src), str(dst))


def find_cases_from_inputs(nnunet_inputs_dir: Path):
    """Return sorted unique case IDs found in nnunet_inputs by filenames."""
    case_ids = set()
    for p in nnunet_inputs_dir.glob("BraTS2021_*_000?.nii.gz"):
        m = CASE_RE.match(p.name)
        if m:
            case_ids.add(m.group(1))
    return sorted(case_ids)


def get_gt_path(case_id: str) -> Path | None:
    # BraTS GT usually is: DATA_DIR/<case_id>/<case_id>_seg.nii.gz
    p = Path(DATA_DIR) / case_id / f"{case_id}_seg.nii.gz"
    return p if p.exists() else None


def get_pred_path(case_id: str) -> Path | None:
    # your pred is: PRED_DIR/<case_id>.nii.gz
    p = Path(PRED_DIR) / f"{case_id}.nii.gz"
    return p if p.exists() else None


def get_modality_path(case_id: str, ch: int) -> Path | None:
    p = Path(NN_INPUT_BASE) / f"{case_id}_{ch:04d}.nii.gz"
    return p if p.exists() else None


def main():
    nn_inputs = Path(NN_INPUT_BASE)
    if not nn_inputs.exists():
        raise FileNotFoundError(f"NN_INPUT_BASE not found: {NN_INPUT_BASE}")

    CASES_DIR.mkdir(parents=True, exist_ok=True)

    case_ids = find_cases_from_inputs(nn_inputs)
    if not case_ids:
        raise RuntimeError(f"No cases found in {NN_INPUT_BASE} (expect BraTS2021_00000_0000.nii.gz etc)")

    index = []
    print(f"Found {len(case_ids)} cases from nnunet_inputs.")

    for cid in case_ids:
        out_case = CASES_DIR / cid
        out_case.mkdir(parents=True, exist_ok=True)

        # copy modalities
        ok_mods = True
        for ch in range(4):
            src = get_modality_path(cid, ch)
            if src is None:
                ok_mods = False
                print(f"[WARN] missing modality: {cid}_{ch:04d}.nii.gz")
                continue
            dst = out_case / f"{MOD_MAP[ch]}.nii.gz"
            safe_copy(src, dst)

        gt = get_gt_path(cid)
        pred = get_pred_path(cid)

        has_gt = False
        has_pred = False

        if gt is not None:
            safe_copy(gt, out_case / "gt.nii.gz")
            has_gt = True
        else:
            print(f"[WARN] GT not found for {cid}: {Path(DATA_DIR)/cid/(cid+'_seg.nii.gz')}")

        if pred is not None:
            safe_copy(pred, out_case / "pred.nii.gz")
            has_pred = True
        else:
            # don't warn too aggressively; some cases may not be predicted yet
            print(f"[WARN] Pred not found for {cid}: {Path(PRED_DIR)/(cid+'.nii.gz')}")

        item = {
            "case_id": cid,
            "path": f"cases/{cid}",
            "modalities": {
                "t1":   f"cases/{cid}/t1.nii.gz"   if (out_case / "t1.nii.gz").exists() else None,
                "t1ce": f"cases/{cid}/t1ce.nii.gz" if (out_case / "t1ce.nii.gz").exists() else None,
                "t2":   f"cases/{cid}/t2.nii.gz"   if (out_case / "t2.nii.gz").exists() else None,
                "flair":f"cases/{cid}/flair.nii.gz"if (out_case / "flair.nii.gz").exists() else None,
            },
            "gt":   f"cases/{cid}/gt.nii.gz"   if has_gt else None,
            "pred": f"cases/{cid}/pred.nii.gz" if has_pred else None,
            "gifs": {
                "gt":     f"cases/{cid}/gt.gif"     if (out_case / "gt.gif").exists() else None,
                "pred":   f"cases/{cid}/pred.gif"   if (out_case / "pred.gif").exists() else None,
                "merged": f"cases/{cid}/merged.gif" if (out_case / "merged.gif").exists() else None,
            }
        }
        index.append(item)

        tag = "OK" if ok_mods else "PARTIAL"
        print(f"[{tag}] {cid}  gt={has_gt} pred={has_pred}")

    # write index.json for webpage
    index_path = CASES_DIR / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"\nWrote: {index_path}")
    print("Next: run make_gifs.py (optional) then python server.py")


if __name__ == "__main__":
    main()
