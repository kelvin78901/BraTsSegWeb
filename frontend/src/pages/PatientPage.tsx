import { useEffect, useState, useCallback } from 'react';
import { useViewerStore } from '../store/viewerStore';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../api/client';
import { loadNifti } from '../lib/niftiLoader';
import AppHeader from '../components/AppHeader';
import ViewerPanel from '../components/ViewerPanel';
import ChatPanel from '../components/ChatPanel';
import MetricsCard from '../components/MetricsCard';
import PatientSnapshot from '../components/PatientSnapshot';
import UploadPanel from '../components/UploadPanel';
import InferencePanel from '../components/InferencePanel';
import './PatientPage.css';

export default function PatientPage() {
  const user = useAuthStore((s) => s.user);
  const {
    caseId, model, availableCases, availableModels,
    setCaseId, setModel, setAvailableCases, setAvailableModels,
    setMri, setPred, setMetrics, setSlice,
  } = useViewerStore();

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    const loadCaseList = async () => {

      for (const url of ['/data/index_pred.json', '/data/index.json', '/viewer/cases/index.json']) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const data = await resp.json();
          const ids: string[] = Array.isArray(data)
            ? data.map((c: unknown) => typeof c === 'string' ? c : (c as { id: string }).id).filter(Boolean)
            : [];
          if (ids.length) {
            setAvailableCases(ids);
            if (!caseId) setCaseId(ids[0]);
            setAvailableModels(['nnunet_v2']);
            if (!model) setModel('nnunet_v2');
            return;
          }
        } catch {  }
      }
    };
    loadCaseList();
  }, []);

  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setStatusMsg('Loading MRI data...');

    const m = model || 'nnunet_v2';
    const base = `/viewer/cases/${caseId}/`;
    const altBase = `/data/${caseId}/`;

    const tryLoad = async (basePath: string) => {
      const mri = await loadNifti(`${basePath}flair.nii.gz`);
      setMri(mri);
      setSlice('axial', Math.floor(mri.dims[2] / 2));
      setSlice('cor', Math.floor(mri.dims[1] / 2));
      setSlice('sag', Math.floor(mri.dims[0] / 2));

      try {
        const pred = await loadNifti(`${basePath}pred.nii.gz`);
        setPred(pred);
      } catch {
        setPred(null);
      }

      try {
        const metricsData = await apiFetch<Record<string, number>>(`${basePath}metrics.json`);
        setMetrics(metricsData);
      } catch {
        setMetrics(null);
      }
    };

    try {
      await tryLoad(base);
      setStatusMsg('Case loaded');
    } catch {
      try {
        await tryLoad(altBase);
        setStatusMsg('Case loaded (demo data)');
      } catch (e) {
        setStatusMsg('Failed to load case: ' + (e instanceof Error ? e.message : ''));
      }
    }
    setLoading(false);
  }, [caseId, model]);

  useEffect(() => { loadCase(); }, [loadCase]);

  return (
    <div className="patient-page">
      <AppHeader />

      <div className="patient-toolbar">
        <div className="toolbar-group">
          <label>Case</label>
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            {availableCases.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn btn-sm btn-primary" onClick={loadCase} disabled={loading}>
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
        <div className="toolbar-group">
          <label>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="toolbar-status">{statusMsg}</div>
      </div>

      <main className="patient-main">

        <div className="patient-viewer">
          <ViewerPanel />
        </div>

        <div className="patient-sidebar">
          <PatientSnapshot />
          <MetricsCard />
          <UploadPanel />
          <InferencePanel />
        </div>

        <div className="patient-ai">
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
