import base64
import io
import os
import shutil
import subprocess
import tempfile
import uuid
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, File, Query, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
import nibabel as nib

app = FastAPI()

_BASE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CASES = os.path.abspath(os.path.join(_BASE, "..", "spring", "demo", "src", "main", "resources", "static", "viewer", "cases"))
CASES_DIR = os.getenv("CASES_DIR", _DEFAULT_CASES)

LABEL_COLORS = {
    1: np.array([255, 50, 50], dtype=np.uint8),
    2: np.array([50, 255, 50], dtype=np.uint8),
    4: np.array([50, 100, 255], dtype=np.uint8),
}


def load_nifti(path: str):
    img = nib.load(path)
    data = img.get_fdata().astype(np.float32)
    return data


def normalize_slice(sl: np.ndarray) -> np.ndarray:
    v = sl[np.isfinite(sl)]
    if v.size == 0:
        return np.zeros_like(sl, dtype=np.uint8)
    lo, hi = np.percentile(v, [1, 99])
    if hi <= lo:
        lo, hi = float(v.min()), float(v.max() + 1e-5)
    sl = np.clip((sl - lo) / (hi - lo), 0, 1)
    return (sl * 255).astype(np.uint8)


def overlay(seg: np.ndarray, base: np.ndarray, alpha: float = 0.35) -> np.ndarray:
    rgb = np.stack([base, base, base], axis=-1).astype(np.float32)
    out = rgb.copy()
    for label, color in LABEL_COLORS.items():
        m = seg == label
        if not np.any(m):
            continue
        out[m] = (1 - alpha) * out[m] + alpha * color
    return out.astype(np.uint8)


def to_png_bytes(arr: np.ndarray) -> bytes:
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@lru_cache(maxsize=8)
def load_case(case_id: str):
    case_dir = os.path.join(CASES_DIR, case_id)
    flair = load_nifti(os.path.join(case_dir, "flair.nii.gz"))
    pred = load_nifti(os.path.join(case_dir, "pred.nii.gz"))
    return flair, pred


@app.get("/render/keyframes")
def keyframes(caseId: str = Query(...), sliceZ: int | None = Query(None)):
    try:
        flair, pred = load_case(caseId)
        x, y, z = flair.shape

        z_mid = z // 2
        y_mid = y // 2
        x_mid = x // 2

        if sliceZ is None:
            sliceZ = z_mid
        sliceZ = int(np.clip(sliceZ, 0, z - 1))

        tumor_counts = (pred > 0).sum(axis=(0, 1))
        axial_max_z = int(np.argmax(tumor_counts)) if tumor_counts.size else z_mid

        # Axial
        ax = normalize_slice(flair[:, :, sliceZ])
        ax_pred = pred[:, :, sliceZ]
        ax_img = overlay(ax_pred, ax)

        # Coronal
        co = normalize_slice(flair[:, y_mid, :])
        co_pred = pred[:, y_mid, :]
        co_img = overlay(co_pred, co)

        # Sagittal
        sa = normalize_slice(flair[x_mid, :, :])
        sa_pred = pred[x_mid, :, :]
        sa_img = overlay(sa_pred, sa)

        # Axial max tumor
        ax2 = normalize_slice(flair[:, :, axial_max_z])
        ax2_pred = pred[:, :, axial_max_z]
        ax2_img = overlay(ax2_pred, ax2)

        imgs = [
            ("axial_z%d.png" % sliceZ, ax_img),
            ("coronal_mid.png", co_img),
            ("sagittal_mid.png", sa_img),
            ("axial_max_tumor.png", ax2_img),
        ]

        out = []
        for name, arr in imgs:
            b = to_png_bytes(arr)
            out.append({
                "name": name,
                "mime": "image/png",
                "b64": base64.b64encode(b).decode("utf-8")
            })

        return JSONResponse({
            "caseId": caseId,
            "images": out,
            "meta": {"sliceZ": sliceZ, "axialMaxZ": axial_max_z}
        })
    except Exception as e:
        return JSONResponse({"caseId": caseId, "images": [], "error": str(e)}, status_code=500)


@app.get("/health")
def health():
    exists = os.path.isdir(CASES_DIR)
    return {"ok": True, "casesDir": CASES_DIR, "casesDirExists": exists}


# ── Segmentation endpoint ──────────────────────────────────────────
# Accepts a .nii.gz (FLAIR or any single-channel MRI), runs nnU-Net
# inference via CLI, and returns overlay keyframe PNGs (base64).

_NNUNET_TASK   = os.getenv("NNUNET_TASK",    "Task500_BraTS2021")
_NNUNET_TRAINER = os.getenv("NNUNET_TRAINER", "nnUNetTrainerV2BraTSRegions_DA4_BN_BD")
_NNUNET_PLANS  = os.getenv("NNUNET_PLANS",   "nnUNetPlansv2.1")
_NNUNET_FOLD   = os.getenv("NNUNET_FOLD",    "0")
_NNUNET_MODEL  = os.getenv("NNUNET_MODEL",   "3d_fullres")


def _run_nnunet(input_nii_path: str, work_dir: str):
    """Run nnU-Net predict on a single volume and return the prediction path."""
    in_dir  = os.path.join(work_dir, "input")
    out_dir = os.path.join(work_dir, "output")
    os.makedirs(in_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    # nnU-Net expects files named  <ID>_0000.nii.gz  (channel 0)
    case_id = "UPLOAD"
    dst = os.path.join(in_dir, f"{case_id}_0000.nii.gz")
    shutil.copy(input_nii_path, dst)

    env = os.environ.copy()
    env["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"

    cmd = [
        "nnUNet_predict",
        "-i", in_dir,
        "-o", out_dir,
        "-t", _NNUNET_TASK,
        "-tr", _NNUNET_TRAINER,
        "-p", _NNUNET_PLANS,
        "-m", _NNUNET_MODEL,
        "-f", _NNUNET_FOLD,
        "--num_threads_preprocessing", "1",
        "--num_threads_nifti_save", "1",
        "--disable_tta",
        "--overwrite_existing",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"nnUNet_predict failed: {result.stderr[-2000:]}")

    pred_path = os.path.join(out_dir, f"{case_id}.nii.gz")
    if not os.path.exists(pred_path):
        raise FileNotFoundError(f"Prediction not found at {pred_path}")
    return pred_path


@app.post("/segment")
async def segment(file: UploadFile = File(...)):
    """
    Upload a .nii.gz MRI volume, run nnU-Net segmentation, return overlay
    keyframe images (base64 PNG) + metadata.
    """
    work_dir = None
    try:
        work_dir = tempfile.mkdtemp(prefix="salynt_seg_")
        input_path = os.path.join(work_dir, file.filename or "upload.nii.gz")
        with open(input_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Run inference
        pred_path = _run_nnunet(input_path, work_dir)

        # Load volumes
        flair = load_nifti(input_path)
        pred  = load_nifti(pred_path)
        x, y, z = flair.shape

        z_mid = z // 2
        y_mid = y // 2
        x_mid = x // 2

        tumor_counts = (pred > 0).sum(axis=(0, 1))
        axial_max_z = int(np.argmax(tumor_counts)) if tumor_counts.size else z_mid

        # Axial mid
        ax = normalize_slice(flair[:, :, z_mid])
        ax_img = overlay(pred[:, :, z_mid], ax)

        # Coronal mid
        co = normalize_slice(flair[:, y_mid, :])
        co_img = overlay(pred[:, y_mid, :], co)

        # Sagittal mid
        sa = normalize_slice(flair[x_mid, :, :])
        sa_img = overlay(pred[x_mid, :, :], sa)

        # Axial max tumor
        ax2 = normalize_slice(flair[:, :, axial_max_z])
        ax2_img = overlay(pred[:, :, axial_max_z], ax2)

        imgs = [
            ("axial_mid.png", ax_img),
            ("coronal_mid.png", co_img),
            ("sagittal_mid.png", sa_img),
            ("axial_max_tumor.png", ax2_img),
        ]

        out = []
        for name, arr in imgs:
            b = to_png_bytes(arr)
            out.append({
                "name": name,
                "mime": "image/png",
                "b64": base64.b64encode(b).decode("utf-8"),
            })

        return JSONResponse({
            "ok": True,
            "images": out,
            "meta": {
                "shape": list(flair.shape),
                "axialMaxZ": axial_max_z,
            },
        })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    finally:
        if work_dir and os.path.isdir(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)
