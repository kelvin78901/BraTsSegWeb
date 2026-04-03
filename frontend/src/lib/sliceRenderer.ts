import type { VolumeData } from '../types/nifti.d';

export type Axis = 'ax' | 'co' | 'sa';

interface PlaneData {
  w: number;
  h: number;
  data: Float32Array;
}

export function getPlane(vol: VolumeData, axis: Axis, idx: number): PlaneData {
  const [X, Y, Z] = vol.dims;
  let w: number, h: number, buf: Float32Array;

  if (axis === 'ax') {

    w = X; h = Y;
    buf = new Float32Array(w * h);
    const off = idx * w * h;
    for (let i = 0; i < w * h; i++) buf[i] = vol.data[off + i];
  } else if (axis === 'co') {

    w = X; h = Z;
    buf = new Float32Array(w * h);
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++)
        buf[z * w + x] = vol.data[x + idx * X + z * X * Y];
  } else {

    w = Y; h = Z;
    buf = new Float32Array(w * h);
    for (let z = 0; z < h; z++)
      for (let y = 0; y < w; y++)
        buf[z * w + y] = vol.data[idx + y * X + z * X * Y];
  }

  return { w, h, data: buf };
}

const LABEL_COLORS: Record<number, [number, number, number]> = {
  1: [255, 50, 50],
  2: [50, 255, 50],
  4: [50, 100, 255],
};

export function drawSlice(
  canvas: HTMLCanvasElement,
  mri: VolumeData,
  pred: VolumeData | null,
  axis: Axis,
  idx: number,
  opacity: number
): void {
  const m = getPlane(mri, axis, idx);
  const p = pred ? getPlane(pred, axis, idx) : null;

  const cw = canvas.clientWidth || 300;
  const ch = canvas.clientHeight || 300;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  const off = document.createElement('canvas');
  off.width = m.w;
  off.height = m.h;
  const offCtx = off.getContext('2d')!;
  const idata = offCtx.createImageData(m.w, m.h);
  const d = idata.data;

  let max = 0;
  for (let i = 0; i < m.data.length; i++) if (m.data[i] > max) max = m.data[i];
  if (max === 0) max = 1;

  for (let i = 0; i < m.data.length; i++) {
    const val = (m.data[i] / max) * 255;
    const lbl = p ? p.data[i] : 0;
    const k = i * 4;
    d[k] = val;
    d[k + 1] = val;
    d[k + 2] = val;
    d[k + 3] = 255;

    if (lbl > 0) {
      const c = LABEL_COLORS[lbl] || [200, 200, 200];
      d[k]     = d[k]     * (1 - opacity) + c[0] * opacity;
      d[k + 1] = d[k + 1] * (1 - opacity) + c[1] * opacity;
      d[k + 2] = d[k + 2] * (1 - opacity) + c[2] * opacity;
    }
  }
  offCtx.putImageData(idata, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const srcAR = m.w / m.h;
  const dstAR = cw / ch;
  let dx: number, dy: number, dw: number, dh: number;
  if (srcAR > dstAR) {
    dw = cw;  dh = Math.round(cw / srcAR);
    dx = 0;   dy = Math.round((ch - dh) / 2);
  } else {
    dh = ch;  dw = Math.round(ch * srcAR);
    dx = Math.round((cw - dw) / 2); dy = 0;
  }
  ctx.drawImage(off, dx, dy, dw, dh);
}

export function drawDiff(
  canvas: HTMLCanvasElement,
  mri: VolumeData,
  gt: VolumeData,
  pred: VolumeData,
  axis: Axis,
  idx: number,
  opacity: number
): void {
  const m = getPlane(mri, axis, idx);
  const g = getPlane(gt, axis, idx);
  const p = getPlane(pred, axis, idx);

  const cw = canvas.clientWidth || 300;
  const ch = canvas.clientHeight || 300;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw; canvas.height = ch;
  }

  const off = document.createElement('canvas');
  off.width = m.w; off.height = m.h;
  const offCtx = off.getContext('2d')!;
  const idata = offCtx.createImageData(m.w, m.h);
  const d = idata.data;

  let max = 0;
  for (let i = 0; i < m.data.length; i++) if (m.data[i] > max) max = m.data[i];
  if (max === 0) max = 1;

  for (let i = 0; i < m.data.length; i++) {
    const val = (m.data[i] / max) * 255;
    const k = i * 4;
    d[k] = val; d[k + 1] = val; d[k + 2] = val; d[k + 3] = 255;

    const gtLbl = g.data[i] > 0 ? 1 : 0;
    const prLbl = p.data[i] > 0 ? 1 : 0;

    if (prLbl && !gtLbl) {

      d[k]     = d[k]     * (1 - opacity) + 255 * opacity;
      d[k + 1] = d[k + 1] * (1 - opacity) + 60  * opacity;
      d[k + 2] = d[k + 2] * (1 - opacity) + 60  * opacity;
    } else if (!prLbl && gtLbl) {

      d[k]     = d[k]     * (1 - opacity) + 60  * opacity;
      d[k + 1] = d[k + 1] * (1 - opacity) + 255 * opacity;
      d[k + 2] = d[k + 2] * (1 - opacity) + 60  * opacity;
    } else if (prLbl && gtLbl) {

      d[k]     = d[k]     * (1 - opacity) + 50  * opacity;
      d[k + 1] = d[k + 1] * (1 - opacity) + 220 * opacity;
      d[k + 2] = d[k + 2] * (1 - opacity) + 255 * opacity;
    }
  }
  offCtx.putImageData(idata, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const srcAR = m.w / m.h;
  const dstAR = cw / ch;
  let dx: number, dy: number, dw: number, dh: number;
  if (srcAR > dstAR) {
    dw = cw; dh = Math.round(cw / srcAR); dx = 0; dy = Math.round((ch - dh) / 2);
  } else {
    dh = ch; dw = Math.round(ch * srcAR); dx = Math.round((cw - dw) / 2); dy = 0;
  }
  ctx.drawImage(off, dx, dy, dw, dh);
}
