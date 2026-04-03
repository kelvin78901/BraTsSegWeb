from pathlib import Path
from PIL import Image, ImageSequence

def _load_gif_frames(path: str):
    path = Path(path)
    im = Image.open(path)
    frames = []
    durations = []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGBA"))
        durations.append(fr.info.get("duration", 80))
    loop = im.info.get("loop", 0)
    return frames, durations, loop

def merge_two_gif(
    filename1: str,
    filename2: str,
    out_gif: str,
    mode: str = "h",
    pad: int = 8,
    bg=(0, 0, 0, 255)
):
    f1, d1, loop1 = _load_gif_frames(filename1)
    f2, d2, loop2 = _load_gif_frames(filename2)

    n = min(len(f1), len(f2))
    if n == 0:
        raise ValueError("GIF has no frames")

    w1, h1 = f1[0].size
    w2, h2 = f2[0].size

    if (w1, h1) != (w2, h2):
        f2 = [fr.resize((w1, h1), Image.BILINEAR) for fr in f2]

    out_frames = []
    out_durations = []

    for i in range(n):
        a = f1[i]
        b = f2[i]
        if mode == "h":
            out_w = w1 + pad + w1
            out_h = h1
            canvas = Image.new("RGBA", (out_w, out_h), bg)
            canvas.paste(a, (0, 0))
            canvas.paste(b, (w1 + pad, 0))
        elif mode == "v":
            out_w = w1
            out_h = h1 + pad + h1
            canvas = Image.new("RGBA", (out_w, out_h), bg)
            canvas.paste(a, (0, 0))
            canvas.paste(b, (0, h1 + pad))
        else:
            raise ValueError("mode must be 'h' or 'v'")

        out_frames.append(canvas.convert("P", palette=Image.ADAPTIVE))
        out_durations.append(min(d1[i], d2[i]) if i < len(d1) and i < len(d2) else 80)

    out_path = Path(out_gif)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    out_frames[0].save(
        out_path,
        save_all=True,
        append_images=out_frames[1:],
        duration=out_durations,
        loop=min(loop1, loop2),
        optimize=False,
        disposal=2
    )

    return str(out_path)
