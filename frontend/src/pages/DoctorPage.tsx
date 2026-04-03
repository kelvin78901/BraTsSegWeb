import { useEffect, useState, useRef, useCallback } from 'react';
import { loadNifti } from '../lib/niftiLoader';
import { drawSlice, drawDiff, type Axis } from '../lib/sliceRenderer';
import AppHeader from '../components/AppHeader';
import type { VolumeData } from '../types/nifti.d';
import './DoctorPage.css';

interface CaseIndex {
  gts: string[];
  preds: Record<string, string[]>;
}

interface MetricsRow {
  case_id?: string;
  WT_dice?: number;
  TC_dice?: number;
  ET_dice?: number;
  [k: string]: unknown;
}

export default function DoctorPage() {
  const [cases, setCases] = useState<string[]>([]);
  const [caseId, setCaseId] = useState('');
  const [modality, setModality] = useState('flair');
  const [modelKey, setModelKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [sliceIdx, setSliceIdx] = useState(78);
  const [opacity, setOpacity] = useState(0.5);
  const [maxSlice, setMaxSlice] = useState(155);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsRow | null>(null);

  const mriRef = useRef<VolumeData | null>(null);
  const gtRef = useRef<VolumeData | null>(null);
  const predRef = useRef<VolumeData | null>(null);

  const canvasRefs = {
    raw:  { ax: useRef<HTMLCanvasElement>(null), co: useRef<HTMLCanvasElement>(null), sa: useRef<HTMLCanvasElement>(null) },
    gt:   { ax: useRef<HTMLCanvasElement>(null), co: useRef<HTMLCanvasElement>(null), sa: useRef<HTMLCanvasElement>(null) },
    pred: { ax: useRef<HTMLCanvasElement>(null), co: useRef<HTMLCanvasElement>(null), sa: useRef<HTMLCanvasElement>(null) },
    diff: { ax: useRef<HTMLCanvasElement>(null), co: useRef<HTMLCanvasElement>(null), sa: useRef<HTMLCanvasElement>(null) },
  };

  useEffect(() => {
    const loadCases = async () => {
      for (const url of ['/data/index_pred.json', '/data/index.json']) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const data = await resp.json();
          const ids = Array.isArray(data)
            ? data.map((c: unknown) => typeof c === 'string' ? c : (c as { id: string }).id).filter(Boolean)
            : [];
          if (ids.length) {
            setCases(ids);
            if (!caseId) setCaseId(ids[0]);
            return;
          }
        } catch {  }
      }
    };
    loadCases();

  }, []);

  const loadVolumes = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);

    const base = `/data/${caseId}/`;

    try {

      const mri = await loadNifti(`${base}${modality}.nii.gz`);
      mriRef.current = mri;
      setMaxSlice(mri.dims[2] - 1);
      setSliceIdx(Math.floor(mri.dims[2] / 2));

      try {
        const gt = await loadNifti(`${base}gt.nii.gz`);
        gtRef.current = gt;
      } catch {
        gtRef.current = null;
      }

      try {
        const idxResp = await fetch(`${base}index.json`);
        const idx: CaseIndex = await idxResp.json();
        const modelNames = Object.keys(idx.preds || {});
        setModels(modelNames);
        const mk = modelNames.includes(modelKey) ? modelKey : modelNames[0] || '';
        setModelKey(mk);

        if (mk && idx.preds[mk]?.length) {
          const predFile = idx.preds[mk][0];
          const pred = await loadNifti(`${base}${predFile}`);
          predRef.current = pred;
        } else {
          predRef.current = null;
        }
      } catch {

        try {
          const pred = await loadNifti(`${base}pred.nii.gz`);
          predRef.current = pred;
          setModels(['default']);
          setModelKey('default');
        } catch {
          predRef.current = null;
        }
      }

      try {
        const mr = await fetch(`${base}metrics.json`);
        if (mr.ok) {
          const mdata = await mr.json() as MetricsRow;
          mdata.case_id = caseId;
          setMetrics(mdata);
        } else {
          setMetrics(null);
        }
      } catch {
        setMetrics(null);
      }
    } catch (e) {
      console.error('Failed to load volumes:', e);
    }

    setLoading(false);
  }, [caseId, modality, modelKey]);

  useEffect(() => { loadVolumes(); }, [caseId, modality]);

  const renderAll = useCallback(() => {
    const mri = mriRef.current;
    if (!mri) return;
    const gt = gtRef.current;
    const pred = predRef.current;
    const axes: Axis[] = ['ax', 'co', 'sa'];
    const slices = [sliceIdx, Math.floor(mri.dims[1] / 2), Math.floor(mri.dims[0] / 2)];

    for (let i = 0; i < 3; i++) {
      const axis = axes[i];
      const si = slices[i];

      const rawCvs = canvasRefs.raw[axis].current;
      if (rawCvs) drawSlice(rawCvs, mri, null, axis, si, 0);

      const gtCvs = canvasRefs.gt[axis].current;
      if (gtCvs && gt) drawSlice(gtCvs, mri, gt, axis, si, opacity);
      else if (gtCvs) drawSlice(gtCvs, mri, null, axis, si, 0);

      const predCvs = canvasRefs.pred[axis].current;
      if (predCvs && pred) drawSlice(predCvs, mri, pred, axis, si, opacity);
      else if (predCvs) drawSlice(predCvs, mri, null, axis, si, 0);

      const diffCvs = canvasRefs.diff[axis].current;
      if (diffCvs && gt && pred) drawDiff(diffCvs, mri, gt, pred, axis, si, opacity);
      else if (diffCvs) drawSlice(diffCvs, mri, null, axis, si, 0);
    }
  }, [sliceIdx, opacity]);

  useEffect(() => { renderAll(); }, [renderAll, loading]);

  return (
    <div className="doctor-page">
      <AppHeader />

      <div className="doctor-toolbar">
        <div className="toolbar-group">
          <label>Case</label>
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            {cases.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="toolbar-group">
          <label>Modality</label>
          <select value={modality} onChange={(e) => setModality(e.target.value)}>
            {['flair', 't1', 't1ce', 't2'].map((m) => (
              <option key={m} value={m}>{m.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="toolbar-group">
          <label>Model</label>
          <select value={modelKey} onChange={(e) => { setModelKey(e.target.value); }}>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" onClick={loadVolumes} disabled={loading}>
            {loading ? 'Loading...' : 'Reload'}
          </button>
        </div>
        <div className="toolbar-group">
          <label>Slice Z</label>
          <input type="range" min={0} max={maxSlice} value={sliceIdx}
            onChange={(e) => setSliceIdx(+e.target.value)} />
          <span className="tool-val">{sliceIdx}</span>
        </div>
        <div className="toolbar-group">
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.05} value={opacity}
            onChange={(e) => setOpacity(+e.target.value)} />
        </div>
      </div>

      <main className="doctor-main">

        <div className="doctor-grid">

          <div className="grid-header" />
          <div className="grid-header">AXIAL</div>
          <div className="grid-header">CORONAL</div>
          <div className="grid-header">SAGITTAL</div>

          <div className="grid-row-label">RAW</div>
          <div className="viewport-cell"><canvas ref={canvasRefs.raw.ax} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.raw.co} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.raw.sa} /></div>

          <div className="grid-row-label">GT</div>
          <div className="viewport-cell"><canvas ref={canvasRefs.gt.ax} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.gt.co} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.gt.sa} /></div>

          <div className="grid-row-label">PRED</div>
          <div className="viewport-cell"><canvas ref={canvasRefs.pred.ax} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.pred.co} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.pred.sa} /></div>

          <div className="grid-row-label">DIFF</div>
          <div className="viewport-cell"><canvas ref={canvasRefs.diff.ax} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.diff.co} /></div>
          <div className="viewport-cell"><canvas ref={canvasRefs.diff.sa} /></div>
        </div>

        <div className="doctor-sidebar">

          <div className="card">
            <div className="card-title">Dice Metrics</div>
            {metrics ? (
              <div className="kpi-grid">
                <div className="kpi-box">
                  <div className="kpi-label">Whole Tumor</div>
                  <div className="kpi-value">{metrics.WT_dice?.toFixed(4) ?? '--'}</div>
                </div>
                <div className="kpi-box">
                  <div className="kpi-label">Tumor Core</div>
                  <div className="kpi-value" style={{ color: 'var(--purple2)' }}>
                    {metrics.TC_dice?.toFixed(4) ?? '--'}
                  </div>
                </div>
                <div className="kpi-box">
                  <div className="kpi-label">Enhancing</div>
                  <div className="kpi-value" style={{ color: 'var(--green)' }}>
                    {metrics.ET_dice?.toFixed(4) ?? '--'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No metrics available</div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Legend</div>
            <div className="legend-list">
              <div><span className="legend-dot" style={{ background: '#ff3232' }} /> Label 1 · Necrotic Core</div>
              <div><span className="legend-dot" style={{ background: '#32ff32' }} /> Label 2 · Edema</div>
              <div><span className="legend-dot" style={{ background: '#3264ff' }} /> Label 4 · Enhancing</div>
              <div style={{ marginTop: 8 }}><span className="legend-dot" style={{ background: '#ff3c3c' }} /> FP (False Positive)</div>
              <div><span className="legend-dot" style={{ background: '#3cff3c' }} /> FN (False Negative)</div>
              <div><span className="legend-dot" style={{ background: '#32dcff' }} /> TP (True Positive)</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Cases ({cases.length})</div>
            <div className="case-list">
              {cases.map((c) => (
                <button
                  key={c}
                  className={`case-item ${c === caseId ? 'active' : ''}`}
                  onClick={() => setCaseId(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
