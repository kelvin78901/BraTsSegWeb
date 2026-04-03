import base64
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from datetime import datetime
from functools import lru_cache

import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
import nibabel as nib
from starlette.formparsers import MultiPartParser

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","module":"%(module)s","message":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("sidecar")

app = FastAPI(title="BraTS Sidecar", version="1.0.0")

_SIDECAR_SECRET = os.getenv("SIDECAR_SECRET", "").strip()

def _require_sidecar_key(x_sidecar_key: str = Header(default="", alias="X-Sidecar-Key")):
    """Dependency: enforces X-Sidecar-Key header when SIDECAR_SECRET is configured."""
    if _SIDECAR_SECRET and x_sidecar_key != _SIDECAR_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden: missing or invalid X-Sidecar-Key")

_MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(512 * 1024 * 1024)))
if hasattr(MultiPartParser, "max_file_size"):
    MultiPartParser.max_file_size = _MAX_UPLOAD_BYTES
if hasattr(MultiPartParser, "max_part_size"):
    MultiPartParser.max_part_size = _MAX_UPLOAD_BYTES

_BASE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CASES = os.path.abspath(os.path.join(_BASE, "..", "spring", "demo", "src", "main", "resources", "static", "viewer", "cases"))
CASES_DIR = os.getenv("CASES_DIR", _DEFAULT_CASES)
_INDEX_JSON_PATH = os.path.join(CASES_DIR, "index.json")
_INDEX_LOCK = threading.Lock()

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

def _new_upload_case_id() -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"UPLOAD_{stamp}_{uuid.uuid4().hex[:6].upper()}"

def _update_index_json(case_id: str):
    with _INDEX_LOCK:
        os.makedirs(CASES_DIR, exist_ok=True)
        case_list = []
        if os.path.exists(_INDEX_JSON_PATH):
            try:
                with open(_INDEX_JSON_PATH, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    if isinstance(loaded, list):
                        case_list = [str(x) for x in loaded]
            except Exception:
                case_list = []

        if case_id not in case_list:
            case_list.append(case_id)

        case_list = sorted(set(case_list))
        with open(_INDEX_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(case_list, f, ensure_ascii=False, indent=2)

def _persist_uploaded_case(case_id: str, input_nii_path: str, pred_path: str):
    case_dir = os.path.join(CASES_DIR, case_id)
    os.makedirs(case_dir, exist_ok=True)

    flair_path = os.path.join(case_dir, "flair.nii.gz")
    t1_path = os.path.join(case_dir, "t1.nii.gz")
    t1ce_path = os.path.join(case_dir, "t1ce.nii.gz")
    t2_path = os.path.join(case_dir, "t2.nii.gz")
    pred_out = os.path.join(case_dir, "pred.nii.gz")

    shutil.copy2(input_nii_path, flair_path)
    shutil.copy2(input_nii_path, t1_path)
    shutil.copy2(input_nii_path, t1ce_path)
    shutil.copy2(input_nii_path, t2_path)
    shutil.copy2(pred_path, pred_out)

    _update_index_json(case_id)
    load_case.cache_clear()

    return {
        "caseId": case_id,
        "casePath": f"/viewer/cases/{case_id}",
        "warning": (
            "Single-modality input was replicated across all 4 channels. "
            "TC and ET region metrics are likely unreliable without T1/T1ce/T2 modalities."
        ),
    }

@lru_cache(maxsize=8)
def load_case(case_id: str):
    case_dir = os.path.join(CASES_DIR, case_id)
    flair = load_nifti(os.path.join(case_dir, "flair.nii.gz"))
    pred = load_nifti(os.path.join(case_dir, "pred.nii.gz"))
    return flair, pred

@app.get("/render/keyframes", dependencies=[Depends(_require_sidecar_key)])
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

        ax = normalize_slice(flair[:, :, sliceZ])
        ax_pred = pred[:, :, sliceZ]
        ax_img = overlay(ax_pred, ax)

        co = normalize_slice(flair[:, y_mid, :])
        co_pred = pred[:, y_mid, :]
        co_img = overlay(co_pred, co)

        sa = normalize_slice(flair[x_mid, :, :])
        sa_pred = pred[x_mid, :, :]
        sa_img = overlay(sa_pred, sa)

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
    backends = {
        "nnunet_v2": bool(shutil.which("nnUNetv2_predict")),
        "nnunet_v1": bool(shutil.which("nnUNet_predict")),
        "onnx": os.path.isfile(os.getenv("ONNX_MODEL_PATH", os.path.join(_BASE, "models", "monai_brats", "model.onnx"))),
        "monai": True,
    }
    return {
        "ok": True,
        "casesDir": CASES_DIR,
        "casesDirExists": exists,
        "segBackend": os.getenv("SEG_BACKEND", "auto"),
        "availableBackends": backends,
    }

@app.on_event("startup")
def _startup_log():
    logger.info("Sidecar starting: CASES_DIR=%s, SEG_BACKEND=%s, AUTH=%s",
                CASES_DIR,
                os.getenv("SEG_BACKEND", "auto"),
                "enabled" if _SIDECAR_SECRET else "disabled")

_NNUNET_TASK   = os.getenv("NNUNET_TASK",    "Task500_BraTS2021")
_NNUNET_TRAINER = os.getenv("NNUNET_TRAINER", "nnUNetTrainerV2BraTSRegions_DA4_BN_BD")
_NNUNET_PLANS  = os.getenv("NNUNET_PLANS",   "nnUNetPlansv2.1")
_NNUNET_FOLD   = os.getenv("NNUNET_FOLD",    "0")
_NNUNET_MODEL  = os.getenv("NNUNET_MODEL",   "3d_fullres")
_NNUNET_DATASET = os.getenv("NNUNET_DATASET", "500")
_SEG_BACKEND   = os.getenv("SEG_BACKEND", "auto").strip().lower()

_OPEN_MODEL_URL = os.getenv(
    "OPEN_BRATS_MODEL_URL",
    "https://huggingface.co/MONAI/brats_mri_segmentation/resolve/main/models/model.pt"
)
_OPEN_MODEL_PATH = os.getenv(
    "OPEN_BRATS_MODEL_PATH",
    os.path.join(_BASE, "models", "monai_brats", "model.pt")
)

_ONNX_MODEL_PATH = os.getenv(
    "ONNX_MODEL_PATH",
    os.path.join(_BASE, "models", "monai_brats", "model.onnx")
)

def _run_open_brats_infer(input_nii_path: str, work_dir: str):
    pred_path = os.path.join(work_dir, "open_model_pred.nii.gz")
    script_path = os.path.join(_BASE, "open_brats_infer.py")
    cmd = [
        sys.executable,
        script_path,
        "--input", input_nii_path,
        "--output", pred_path,
        "--model-path", _OPEN_MODEL_PATH,
        "--model-url", _OPEN_MODEL_URL,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"Open model inference failed: {result.stderr[-2000:] or result.stdout[-2000:]}")
    if not os.path.exists(pred_path):
        raise FileNotFoundError(f"Prediction not found at {pred_path}")
    return pred_path

def _run_onnx_infer(input_nii_path: str, work_dir: str):
    """Run BraTS inference via ONNX Runtime (CPU only, no torch needed)."""
    pred_path = os.path.join(work_dir, "onnx_pred.nii.gz")
    script_path = os.path.join(_BASE, "onnx_brats_infer.py")
    cmd = [
        sys.executable,
        script_path,
        "--input", input_nii_path,
        "--output", pred_path,
        "--model-path", _ONNX_MODEL_PATH,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(f"ONNX inference failed: {result.stderr[-2000:] or result.stdout[-2000:]}")
    if not os.path.exists(pred_path):
        raise FileNotFoundError(f"ONNX prediction not found at {pred_path}")
    return pred_path

def _run_nnunet(input_nii_path: str, work_dir: str):
    """Run nnU-Net predict on a single volume and return the prediction path.
    Auto-detects nnU-Net v2 (nnUNetv2_predict) before falling back to v1 (nnUNet_predict).
    """
    in_dir  = os.path.join(work_dir, "input")
    out_dir = os.path.join(work_dir, "output")
    os.makedirs(in_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    case_id = "UPLOAD"
    dst = os.path.join(in_dir, f"{case_id}_0000.nii.gz")
    shutil.copy(input_nii_path, dst)

    env = os.environ.copy()
    env["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"

    if shutil.which("nnUNetv2_predict"):
        cmd = [
            "nnUNetv2_predict",
            "-i", in_dir,
            "-o", out_dir,
            "-d", _NNUNET_DATASET,
            "-c", _NNUNET_MODEL,
            "-f", _NNUNET_FOLD,
            "--disable_tta",
        ]
        cli_version = "v2"
    elif shutil.which("nnUNet_predict"):
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
        cli_version = "v1"
    else:
        raise FileNotFoundError(
            "Neither nnUNetv2_predict nor nnUNet_predict found in PATH. "
            "Install nnU-Net v2 (pip install nnunetv2) or set SEG_BACKEND=onnx."
        )

    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(
            f"nnUNet_predict ({cli_version}) failed:\n"
            + (result.stderr[-2000:] or result.stdout[-2000:])
        )

    pred_path = os.path.join(out_dir, f"{case_id}.nii.gz")
    if not os.path.exists(pred_path):
        raise FileNotFoundError(f"Prediction not found at {pred_path}")
    return pred_path

@app.post("/segment", dependencies=[Depends(_require_sidecar_key)])
async def segment(file: UploadFile = File(...)):
    """
    Upload a .nii.gz MRI volume, run nnU-Net segmentation, return overlay
    keyframe images (base64 PNG) + metadata.
    """

    fname = (file.filename or "").lower()
    if not fname.endswith(".nii.gz") and not fname.endswith(".nii"):
        raise HTTPException(status_code=400, detail="Only NIfTI files (.nii, .nii.gz) are accepted")

    work_dir = None
    try:
        work_dir = tempfile.mkdtemp(prefix="salynt_seg_")
        input_path = os.path.join(work_dir, file.filename or "upload.nii.gz")
        with open(input_path, "wb") as f:
            content = await file.read()
            f.write(content)

        file_mb = len(content) / (1024 * 1024)
        logger.info("Segment request: file=%s size=%.1fMB", file.filename, file_mb)

        backend_used = "nnunet"
        saved_case = None

        if _SEG_BACKEND == "nnunet":
            pred_path = _run_nnunet(input_path, work_dir)
            backend_used = "nnunet"
        elif _SEG_BACKEND in {"open", "open-monai", "monai"}:
            pred_path = _run_open_brats_infer(input_path, work_dir)
            backend_used = "open-monai"
        elif _SEG_BACKEND == "onnx":
            pred_path = _run_onnx_infer(input_path, work_dir)
            backend_used = "onnx"
        else:

            try:
                pred_path = _run_nnunet(input_path, work_dir)
                backend_used = "nnunet"
            except (FileNotFoundError, RuntimeError):
                if os.path.isfile(_ONNX_MODEL_PATH):
                    try:
                        pred_path = _run_onnx_infer(input_path, work_dir)
                        backend_used = "onnx"
                    except (FileNotFoundError, RuntimeError):
                        pred_path = _run_open_brats_infer(input_path, work_dir)
                        backend_used = "open-monai"
                else:
                    pred_path = _run_open_brats_infer(input_path, work_dir)
                    backend_used = "open-monai"

        case_id = _new_upload_case_id()
        saved_case = _persist_uploaded_case(case_id, input_path, pred_path)

        flair = load_nifti(input_path)
        pred  = load_nifti(pred_path)
        x, y, z = flair.shape

        z_mid = z // 2
        y_mid = y // 2
        x_mid = x // 2

        tumor_counts = (pred > 0).sum(axis=(0, 1))
        axial_max_z = int(np.argmax(tumor_counts)) if tumor_counts.size else z_mid

        ax = normalize_slice(flair[:, :, z_mid])
        ax_img = overlay(pred[:, :, z_mid], ax)

        co = normalize_slice(flair[:, y_mid, :])
        co_img = overlay(pred[:, y_mid, :], co)

        sa = normalize_slice(flair[x_mid, :, :])
        sa_img = overlay(pred[x_mid, :, :], sa)

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

        logger.info("Segment success: case=%s backend=%s shape=%s",
                    saved_case.get("caseId") if saved_case else "?", backend_used, list(flair.shape))

        return JSONResponse({
            "ok": True,
            "images": out,
            "meta": {
                "shape": list(flair.shape),
                "axialMaxZ": axial_max_z,
                "backend": backend_used,
                "savedCase": saved_case,
                "warning": saved_case.get("warning") if saved_case else None,
            },
        })
    except Exception as e:
        logger.exception("Segment failed: %s", e)
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    finally:
        if work_dir and os.path.isdir(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)
