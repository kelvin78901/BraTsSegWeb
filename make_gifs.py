import os
import json
from pathlib import Path

import numpy as np

import nibabel as nib
import imageio.v2 as imageio
from PIL import Image, ImageDraw, ImageFont
from gif_utils import merge_two_gif

THIS_DIR = Path(__file__).resolve().parent
VIEWER_DIR = THIS_DIR / "viewer"
CASES_DIR = VIEWER_DIR / "cases"
INDEX_JSON = CASES_DIR / "index.json"

DEFAULT_MODALITY = "flair"
DEFAULT_VIEW = "axial"
FPS = 12
MAX_FRAMES = 90
PAD_SLICES = 8

LABEL_COLORS = {
    1: (255, 99, 132, 180),
    2: (94, 234, 212, 170),
    4: (99, 102, 241, 180),
}

FONT_PATH = None

def load_nii(path: Path) -> np.ndarray:
    """Load NIfTI as float32 numpy array (X,Y,Z) in nibabel default order."""
    img = nib.load(str(path))
    data = img.get_fdata(dtype=np.float32)

    if data.ndim != 3:
        raise ValueError(f"Expected 3D nifti, got shape={data.shape} from {path}")
    return data

def percentile_normalize(x: np.ndarray, p1=1, p99=99) -> np.ndarray:
    lo = np.percentile(x, p1)
    hi = np.percentile(x, p99)
    if hi <= lo:
        hi = lo + 1.0
    y = (x - lo) / (hi - lo)
    y = np.clip(y, 0, 1)
    return y

def slice_2d(vol: np.ndarray, view: str, idx: int) -> np.ndarray:
    """
    Return 2D slice (H,W) with a consistent "display-friendly" orientation.
    - axial:   vol[:, :, idx]
    - coronal: vol[:, idx, :]
    - sagittal:vol[idx, :, :]
    Then rotate/flip for nicer view.
    """
    if view == "axial":
        sl = vol[:, :, idx]
    elif view == "coronal":
        sl = vol[:, idx, :]
    elif view == "sagittal":
        sl = vol[idx, :, :]
    else:
        raise ValueError(f"Unknown view: {view}")

    sl = np.rot90(sl)
    return sl

def rgba_overlay(gray01: np.ndarray, seg: np.ndarray, alpha=0.45) -> Image.Image:
    """
    gray01: 2D float in [0,1]
    seg:    2D labels (0/1/2/4)
    """
    g8 = (gray01 * 255).astype(np.uint8)
    base = Image.fromarray(g8, mode="L").convert("RGBA")

    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pix = overlay.load()

    h = seg.shape[0]
    w = seg.shape[1]

    for y in range(h):
        for x in range(w):
            lab = int(seg[y, x])
            if lab in LABEL_COLORS:
                r, g, b, a = LABEL_COLORS[lab]

                a2 = int(a * alpha)
                pix[x, y] = (r, g, b, a2)

    out = Image.alpha_composite(base, overlay)
    return out

def draw_caption(img: Image.Image, text: str) -> Image.Image:
    img = img.copy()
    draw = ImageDraw.Draw(img)
    if FONT_PATH and Path(FONT_PATH).exists():
        font = ImageFont.truetype(FONT_PATH, 16)
    else:
        font = ImageFont.load_default()

    pad = 6
    x0, y0 = 8, 8
    tw, th = draw.textbbox((0, 0), text, font=font)[2:]
    box = (x0 - pad, y0 - pad, x0 + tw + pad, y0 + th + pad)
    draw.rectangle(box, fill=(0, 0, 0, 160))
    draw.text((x0, y0), text, fill=(255, 255, 255, 230), font=font)
    return img

def find_slice_range(seg3d: np.ndarray, view: str, pad=PAD_SLICES):
    """Find slice range where seg is nonzero. If none, return center range."""
    if view == "axial":
        axis = 2
    elif view == "coronal":
        axis = 1
    elif view == "sagittal":
        axis = 0
    else:
        raise ValueError(view)

    nz = np.where(np.any(seg3d != 0, axis=tuple(i for i in range(3) if i != axis)))[0]
    n_slices = seg3d.shape[axis]

    if len(nz) == 0:
        mid = n_slices // 2
        lo = max(0, mid - 20)
        hi = min(n_slices - 1, mid + 20)
        return lo, hi

    lo = max(0, int(nz.min()) - pad)
    hi = min(n_slices - 1, int(nz.max()) + pad)
    return lo, hi

def linspace_indices(lo: int, hi: int, max_frames: int):
    n = hi - lo + 1
    if n <= max_frames:
        return list(range(lo, hi + 1))

    return list(np.linspace(lo, hi, max_frames).round().astype(int))

def make_overlay_gif(case_id: str, mri_path: Path, seg_path: Path, out_gif: Path,
                     view=DEFAULT_VIEW, modality=DEFAULT_MODALITY):
    mri3d = load_nii(mri_path)
    seg3d = load_nii(seg_path).astype(np.int16)

    mri01 = percentile_normalize(mri3d)

    lo, hi = find_slice_range(seg3d, view=view)
    idxs = linspace_indices(lo, hi, MAX_FRAMES)

    frames = []
    for idx in idxs:
        mri2d = slice_2d(mri01, view, idx)
        seg2d = slice_2d(seg3d, view, idx).astype(np.int16)

        img = rgba_overlay(mri2d, seg2d, alpha=0.55)
        cap = f"{case_id} | {modality} | {view} | slice={idx}"
        img = draw_caption(img, cap)
        frames.append(np.array(img.convert("P", palette=Image.ADAPTIVE)))

    out_gif.parent.mkdir(parents=True, exist_ok=True)
    imageio.mimsave(str(out_gif), frames, duration=1.0 / FPS)
    return lo, hi, len(frames)

def main():
    if not INDEX_JSON.exists():
        raise FileNotFoundError(f"index.json not found: {INDEX_JSON}. Run build_cases.py first.")

    with open(INDEX_JSON, "r", encoding="utf-8") as f:
        items = json.load(f)

    if not items:
        print("No cases in index.json")
        return

    print(f"Loaded {len(items)} cases from {INDEX_JSON}")

    for it in items:
        cid = it["case_id"]
        base = CASES_DIR / cid

        mri_file = base / f"{DEFAULT_MODALITY}.nii.gz"
        if not mri_file.exists():
            print(f"[SKIP] {cid}: missing modality file {mri_file.name}")
            continue

        gt_file = base / "gt.nii.gz"
        pred_file = base / "pred.nii.gz"

        gt_gif = base / "gt.gif"
        pred_gif = base / "pred.gif"
        merged_gif = base / "merged.gif"

        made_any = False

        if gt_file.exists():
            print(f"[GT ] {cid} -> {gt_gif.name}")
            lo, hi, n = make_overlay_gif(cid, mri_file, gt_file, gt_gif, view=DEFAULT_VIEW, modality=DEFAULT_MODALITY)
            print(f"     slices {lo}..{hi}, frames={n}")
            made_any = True
        else:
            print(f"[WARN] {cid}: gt.nii.gz not found, skip gt.gif")

        if pred_file.exists():
            print(f"[PRED] {cid} -> {pred_gif.name}")
            lo, hi, n = make_overlay_gif(cid, mri_file, pred_file, pred_gif, view=DEFAULT_VIEW, modality=DEFAULT_MODALITY)
            print(f"     slices {lo}..{hi}, frames={n}")
            made_any = True
        else:
            print(f"[WARN] {cid}: pred.nii.gz not found, skip pred.gif")

        if gt_gif.exists() and pred_gif.exists():
            print(f"[MERGE] {cid} -> {merged_gif.name}")
            merge_two_gif(str(gt_gif), str(pred_gif), str(merged_gif))
        elif made_any:
            print(f"[INFO] {cid}: only one gif exists, skip merge")

    print("\nDone. GIFs are under: viewer/cases/<CASE_ID>/*.gif")

if __name__ == "__main__":
    main()
