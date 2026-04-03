import type { VolumeData } from '../types/nifti.d';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function wlNormalize(val: number, center: number, width: number): number {
  const lo = center - width * 0.5;
  return clamp01((val - lo) / width);
}

interface Stats {
  mn: number;
  mx: number;
  center: number;
  width: number;
}

function computeStats(mri: VolumeData): Stats {
  const v = mri.data;
  const n = v.length;
  let mn = Infinity;
  let mx = -Infinity;
  const sampleCount = Math.min(20000, n);
  for (let i = 0; i < sampleCount; i++) {
    const idx = (Math.random() * n) | 0;
    const val = v[idx];
    if (val < mn) mn = val;
    if (val > mx) mx = val;
  }
  const center = (mn + mx) * 0.5;
  const width = Math.max(1, mx - mn);
  return { mn, mx, center, width };
}

export function render3D(
  canvas: HTMLCanvasElement,
  mri: VolumeData,
  pred: VolumeData | null,
  angleX: number,
  angleY: number,
  threshold: number,
  stats?: Stats
): void {
  const [X, Y, Z] = mri.dims;

  const dispW = canvas.clientWidth || 300;
  const dispH = canvas.clientHeight || 300;
  if (canvas.width !== dispW || canvas.height !== dispH) {
    canvas.width = dispW;
    canvas.height = dispH;
  }

  const dataAR = X / Z;
  const maxDim = 200;
  let rW: number, rH: number;
  if (dataAR >= 1) {
    rW = maxDim;
    rH = Math.max(60, Math.round(maxDim / dataAR));
  } else {
    rH = maxDim;
    rW = Math.max(60, Math.round(maxDim * dataAR));
  }
  const volScale = X / rW;

  const off = document.createElement('canvas');
  off.width = rW;
  off.height = rH;
  const offCtx = off.getContext('2d')!;
  const img = offCtx.createImageData(rW, rH);
  const buf = img.data;

  const st = stats || computeStats(mri);
  const wlC = st.center;
  const wlW = st.width;

  const cx = X * 0.5;
  const cy = Y * 0.5;
  const cz = Z * 0.5;
  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const step = 2;

  for (let py = 0; py < rH; py++) {
    for (let px = 0; px < rW; px++) {
      let accA = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;

      const ox0 = px * volScale - cx;
      const oz0 = py * volScale - cz;

      for (let depth = 0; depth < Y; depth += step) {
        if (accA > 0.985) break;

        const oy0 = depth - cy;

        let rx = cx + (ox0 * cosY - oy0 * sinY);
        let ry = cy + (ox0 * sinY + oy0 * cosY);
        let rz = cz - oz0;

        if (angleX !== 0) {
          const dy = ry - cy;
          const dz = rz - cz;
          ry = cy + (dy * cosX - dz * sinX);
          rz = cz + (dy * sinX + dz * cosX);
        }

        const ix = rx | 0;
        const iy = ry | 0;
        const iz = rz | 0;
        if (ix < 0 || ix >= X || iy < 0 || iy >= Y || iz < 0 || iz >= Z) continue;

        const idx = ix + iy * X + iz * X * Y;
        const raw = mri.data[idx];
        if (raw <= threshold) continue;

        const lbl = pred ? pred.data[idx] : 0;
        const n = wlNormalize(raw, wlC, wlW);
        const tissue = Math.pow(n, 1.6);
        let srcA = tissue * 0.08;
        let srcR = n;
        let srcG = n;
        let srcB = n;

        if (lbl > 0) {
          let tr = 0, tg = 0, tb = 0;
          if (lbl === 1) { tr = 1.0; }
          else if (lbl === 2) { tg = 1.0; }
          else if (lbl === 4) { tb = 1.0; tr = 0.25; }
          srcR = srcR * 0.35 + tr * 0.65;
          srcG = srcG * 0.35 + tg * 0.65;
          srcB = srcB * 0.35 + tb * 0.65;
          srcA = Math.min(0.95, srcA + 0.35);
        }

        const oneMinusA = 1 - accA;
        accR += oneMinusA * srcR * srcA;
        accG += oneMinusA * srcG * srcA;
        accB += oneMinusA * srcB * srcA;
        accA += oneMinusA * srcA;
      }

      const p = (py * rW + px) * 4;
      buf[p]     = Math.min(255, (accR * 255) | 0);
      buf[p + 1] = Math.min(255, (accG * 255) | 0);
      buf[p + 2] = Math.min(255, (accB * 255) | 0);
      buf[p + 3] = 255;
    }
  }
  offCtx.putImageData(img, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, dispW, dispH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const srcAR = rW / rH;
  const dstAR = dispW / dispH;
  let dx: number, dy: number, dw: number, dh: number;
  if (srcAR > dstAR) {
    dw = dispW; dh = Math.round(dispW / srcAR);
    dx = 0; dy = Math.round((dispH - dh) / 2);
  } else {
    dh = dispH; dw = Math.round(dispH * srcAR);
    dx = Math.round((dispW - dw) / 2); dy = 0;
  }
  ctx.drawImage(off, dx, dy, dw, dh);
}
