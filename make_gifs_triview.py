import json
from pathlib import Path

import numpy as np
import nibabel as nib
import imageio.v2 as imageio
from PIL import Image, ImageDraw, ImageFont, ImageOps

THIS_DIR = Path(__file__).resolve().parent
VIEWER_DIR = THIS_DIR / "viewer"
CASES_DIR = VIEWER_DIR / "cases"
INDEX_JSON = CASES_DIR / "index.json"

FPS = 12
MAX_FRAMES = 90
PAD_SLICES = 8

VIEWS = ["axial", "coronal", "sagittal"]
VIEW_NAMES = {"axial": "Axial", "coronal": "Coronal", "sagittal": "Sagittal"}
ALL_MODALITIES = ["t1", "t1ce", "t2", "flair"]

GAMMA = 0.65
INVERT_MRI = True
AUTOCONTRAST = True
AC_CUTOFF = 1

LABEL_COLORS = {
    1: (255, 99, 132),
    2: (94, 234, 212),
    4: (99, 102, 241),
}

DIFF_COLORS = {
    "FP": (255, 0, 0),
    "FN": (0, 120, 255),
    "TP": (0, 255, 140),
}

FONT_PATH = None

def load_nii(path: Path) -> np.ndarray:
    return nib.load(str(path)).get_fdata(dtype=np.float32)

def normalize_slice_01(x2d: np.ndarray, p1=1, p99=99):
    lo = np.percentile(x2d, p1)
    hi = np.percentile(x2d, p99)
    if hi <= lo:
        hi = lo + 1.0
    y = (x2d - lo) / (hi - lo)
    return np.clip(y, 0, 1)

def slice_2d(vol: np.ndarray, view: str, idx: int):
    if view == "axial":
        sl = vol[:, :, idx]
    elif view == "coronal":
        sl = vol[:, idx, :]
    elif view == "sagittal":
        sl = vol[idx, :, :]
    else:
        raise ValueError(view)
    return np.rot90(sl)

def to_base_rgba(slice2d: np.ndarray) -> Image.Image:
    g01 = normalize_slice_01(slice2d)
    g01 = np.power(g01, GAMMA)
    g8 = (g01 * 255).astype(np.uint8)
    im = Image.fromarray(g8, mode="L")

    if AUTOCONTRAST:
        im = ImageOps.autocontrast(im, cutoff=AC_CUTOFF)
    if INVERT_MRI:
        im = ImageOps.invert(im)

    return im.convert("RGBA")

def mask_to_outline(mask: np.ndarray):
    m = (mask > 0).astype(np.uint8)
    up = np.zeros_like(m); up[1:] = m[:-1]
    dn = np.zeros_like(m); dn[:-1] = m[1:]
    lf = np.zeros_like(m); lf[:,1:] = m[:,:-1]
    rt = np.zeros_like(m); rt[:,:-1] = m[:,1:]
    return (m != up) | (m != dn) | (m != lf) | (m != rt)

def overlay_labels(base: Image.Image, seg2d: np.ndarray):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pix = overlay.load()

    for lb, (r, g, b) in LABEL_COLORS.items():
        m = (seg2d == lb)
        if not np.any(m):
            continue

        for y, x in zip(*np.where(m)):
            pix[int(x), int(y)] = (r, g, b, 70)

        edge = mask_to_outline(m)
        for y, x in zip(*np.where(edge)):
            pix[int(x), int(y)] = (r, g, b, 220)

    return Image.alpha_composite(base, overlay)

def overlay_diff(base: Image.Image, gt2d: np.ndarray, pr2d: np.ndarray):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pix = overlay.load()

    gt = gt2d != 0
    pr = pr2d != 0

    fp = pr & ~gt
    fn = gt & ~pr
    tp = gt & pr

    for name, mask in [("FP", fp), ("FN", fn), ("TP", tp)]:
        r, g, b = DIFF_COLORS[name]
        edge = mask_to_outline(mask)
        for y, x in zip(*np.where(edge)):
            pix[int(x), int(y)] = (r, g, b, 230)

    return Image.alpha_composite(base, overlay)

def draw_title(img: Image.Image, text: str):
    img = img.copy()
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, 16) if FONT_PATH else ImageFont.load_default()
    pad = 6
    x0, y0 = 8, 8
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rectangle((x0-pad, y0-pad, x0+w+pad, y0+h+pad), fill=(0,0,0,160))
    draw.text((x0, y0), text, fill=(255,255,255,230), font=font)
    return img

def hstack(imgs, gap=10):
    h = max(i.height for i in imgs)
    w = sum(i.width for i in imgs) + gap*(len(imgs)-1)
    canvas = Image.new("RGBA", (w, h), (12,18,34,255))
    x = 0
    for im in imgs:
        canvas.paste(im, (x, (h-im.height)//2))
        x += im.width + gap
    return canvas

def vstack(imgs, gap=12):
    w = max(i.width for i in imgs)
    h = sum(i.height for i in imgs) + gap*(len(imgs)-1)
    canvas = Image.new("RGBA", (w, h), (12,18,34,255))
    y = 0
    for im in imgs:
        canvas.paste(im, ((w-im.width)//2, y))
        y += im.height + gap
    return canvas

def find_slice_range(seg3d, view):
    axis = {"axial":2,"coronal":1,"sagittal":0}[view]
    nz = np.where(np.any(seg3d!=0, axis=tuple(i for i in range(3) if i!=axis)))[0]
    n = seg3d.shape[axis]
    if len(nz)==0:
        mid = n//2
        return max(0,mid-20), min(n-1,mid+20)
    return max(0,nz.min()-PAD_SLICES), min(n-1,nz.max()+PAD_SLICES)

def linspace_indices(lo, hi):
    n = hi-lo+1
    if n<=MAX_FRAMES:
        return list(range(lo,hi+1))
    return list(np.linspace(lo,hi,MAX_FRAMES).round().astype(int))

def build_frame(cid, modality, slice_map, mri3d, gt3d, pr3d):
    rows = []
    for view in VIEWS:
        idx = slice_map[view]
        mri = slice_2d(mri3d, view, idx)
        gt  = slice_2d(gt3d,  view, idx).astype(int)
        pr  = slice_2d(pr3d,  view, idx).astype(int)

        base = to_base_rgba(mri)
        img_mri  = draw_title(base, f"{VIEW_NAMES[view]} | MRI")
        img_gt   = draw_title(overlay_labels(base, gt), "Ground Truth")
        img_pr   = draw_title(overlay_labels(base, pr), "Prediction")
        img_diff = draw_title(overlay_diff(base, gt, pr), "Diff (FP/FN/TP)")

        rows.append(hstack([img_mri, img_gt, img_pr, img_diff]))

    body = vstack(rows)
    header = Image.new("RGBA", (body.width, 40), (12,18,34,255))
    header = draw_title(header, f"{cid} | {modality.upper()} | Tri-view")
    return vstack([header, body])

def read_case_ids():
    items = json.loads(INDEX_JSON.read_text(encoding="utf-8"))
    if isinstance(items[0], str):
        return items
    return [it["case_id"] for it in items]

def main():
    case_ids = read_case_ids()

    for cid in case_ids:
        case_dir = CASES_DIR / cid
        gt_path = case_dir / "gt.nii.gz"
        pr_path = case_dir / "pred.nii.gz"

        if not gt_path.exists() or not pr_path.exists():
            continue

        gt3d = load_nii(gt_path).astype(int)
        pr3d = load_nii(pr_path).astype(int)

        pr3d[pr3d == 3] = 4

        for modality in ALL_MODALITIES:
            mri_path = case_dir / f"{modality}.nii.gz"
            if not mri_path.exists():
                continue

            mri3d = load_nii(mri_path)

            ranges = {v: find_slice_range(gt3d, v) for v in VIEWS}
            idxs = {v: linspace_indices(*ranges[v]) for v in VIEWS}
            n = min(len(idxs[v]) for v in VIEWS)
            idxs = {v: idxs[v][:n] for v in VIEWS}

            frames = []
            for t in range(n):
                frame = build_frame(cid, modality,
                                    {v: idxs[v][t] for v in VIEWS},
                                    mri3d, gt3d, pr3d)
                frames.append(np.array(frame.convert("P", palette=Image.ADAPTIVE)))

            out = case_dir / f"triview_{modality}.gif"
            imageio.mimsave(out, frames, duration=1.0/FPS)
            print(f"[OK] {cid} {modality}")

    print("All tri-view GIFs generated.")

if __name__ == "__main__":
    main()
