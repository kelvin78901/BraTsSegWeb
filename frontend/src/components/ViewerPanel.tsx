import { useEffect, useRef, useCallback } from 'react';
import { useViewerStore } from '../store/viewerStore';
import { drawSlice } from '../lib/sliceRenderer';
import { render3D } from '../lib/volumeRenderer';
import './ViewerPanel.css';

export default function ViewerPanel() {
  const { mri, pred, sliceAxial, sliceCor, sliceSag, opacity, angleX, angleY, autoRotate, threshold3d } = useViewerStore();
  const { setSlice, setOpacity, setAutoRotate, setThreshold3d, setAngle } = useViewerStore();

  const cAxial = useRef<HTMLCanvasElement>(null);
  const cCoronal = useRef<HTMLCanvasElement>(null);
  const cSagittal = useRef<HTMLCanvasElement>(null);
  const c3d = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const statsRef = useRef<{ mn: number; mx: number; center: number; width: number } | null>(null);

  useEffect(() => { statsRef.current = null; }, [mri]);

  const draw2D = useCallback(() => {
    if (!mri) return;
    if (cAxial.current)    drawSlice(cAxial.current,    mri, pred, 'ax', sliceAxial, opacity);
    if (cCoronal.current)  drawSlice(cCoronal.current,  mri, pred, 'co', sliceCor, opacity);
    if (cSagittal.current) drawSlice(cSagittal.current, mri, pred, 'sa', sliceSag, opacity);
  }, [mri, pred, sliceAxial, sliceCor, sliceSag, opacity]);

  useEffect(() => {
    if (!mri || !c3d.current) return;
    let running = true;
    let angle = angleY;

    const loop = () => {
      if (!running || !c3d.current) return;
      if (autoRotate) {
        angle += 0.015;
        setAngle(angleX, angle);
      }
      render3D(c3d.current, mri, pred, angleX, angle, threshold3d, statsRef.current || undefined);
      animRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [mri, pred, autoRotate, threshold3d, angleX]);

  useEffect(() => { draw2D(); }, [draw2D]);

  const maxSlice = mri ? mri.dims[2] - 1 : 155;

  return (
    <div className="viewer-panel card">
      <div className="card-title">Imaging Viewer (2D + 3D)</div>

      <div className="viewer-toolbar">
        <div className="tool-group">
          <label>Slice Z</label>
          <input type="range" min={0} max={maxSlice} value={sliceAxial}
            onChange={(e) => setSlice('axial', +e.target.value)} />
          <span className="tool-val">{sliceAxial}</span>
        </div>
        <div className="tool-group">
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.05} value={opacity}
            onChange={(e) => setOpacity(+e.target.value)} />
          <span className="tool-val">{opacity.toFixed(2)}</span>
        </div>
        <div className="tool-group">
          <label>3D Threshold</label>
          <input type="range" min={0} max={100} value={threshold3d}
            onChange={(e) => setThreshold3d(+e.target.value)} />
        </div>
        <div className="tool-group">
          <label>
            <input type="checkbox" checked={autoRotate}
              onChange={(e) => setAutoRotate(e.target.checked)} />
            &nbsp;Auto Rotate
          </label>
        </div>
      </div>

      <div className="viewport-grid">
        <div className="viewport-cell">
          <div className="viewport-label">AXIAL</div>
          <canvas ref={cAxial} />
        </div>
        <div className="viewport-cell">
          <div className="viewport-label">CORONAL</div>
          <canvas ref={cCoronal} />
        </div>
        <div className="viewport-cell">
          <div className="viewport-label">SAGITTAL</div>
          <canvas ref={cSagittal} />
        </div>
        <div className="viewport-cell">
          <div className="viewport-label">3D VOLUME</div>
          <canvas ref={c3d} />
        </div>
      </div>

      <div className="legend">
        <span><span className="legend-dot" style={{ background: '#ff3232' }} />Label 1 · Necrotic Core</span>
        <span><span className="legend-dot" style={{ background: '#32ff32' }} />Label 2 · Edema</span>
        <span><span className="legend-dot" style={{ background: '#3264ff' }} />Label 4 · Enhancing</span>
      </div>
    </div>
  );
}
