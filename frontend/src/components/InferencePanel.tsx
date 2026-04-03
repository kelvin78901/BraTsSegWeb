import { useState, useRef, useEffect } from 'react';
import { useInferenceStore } from '../store/inferenceStore';
import { useViewerStore } from '../store/viewerStore';
import { useAuthStore } from '../store/authStore';
import { loadNifti } from '../lib/niftiLoader';
import type { InferJob } from '../api/inference';
import './InferencePanel.css';

export default function InferencePanel() {
  const [dragging, setDragging] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);

  const {
    models,
    selectedModelId,
    setSelectedModelId,
    fetchModels,
    submit,
    startPolling,
    activeJobId,
    polling,
    jobs,
    fetchJobs,
  } = useInferenceStore();

  const setMri = useViewerStore((s) => s.setMri);
  const setPred = useViewerStore((s) => s.setPred);
  const setMetrics = useViewerStore((s) => s.setMetrics);

  useEffect(() => {
    fetchModels();
    fetchJobs();
  }, [fetchModels, fetchJobs]);

  const handleComplete = async (job: InferJob) => {
    if (job.status === 'FAILED') {
      setStatusText(`Segmentation failed: ${job.error ?? 'unknown error'}`);
      setProgress(0);
      return;
    }

    setProgress(90);
    setStatusText('Loading results...');

    try {

      const images = job.images ?? {};
      const mriUrl = images.mriUrl ?? images.t1ce;
      const predUrl = images.predUrl ?? images.segmentation;

      if (mriUrl && typeof mriUrl === 'string') {
        const mri = await loadNifti(mriUrl);
        setMri(mri);
      }
      if (predUrl && typeof predUrl === 'string') {
        const pred = await loadNifti(predUrl);
        setPred(pred);
      }

      const metrics = (job.metadata as Record<string, number>) ?? null;
      if (metrics) setMetrics(metrics);

      setProgress(100);
      setStatusText(
        `Segmentation complete! (${job.elapsedMs ? (job.elapsedMs / 1000).toFixed(1) + 's' : 'done'})`
      );
    } catch (e) {
      setStatusText('Result loaded, but viewer update failed: ' + (e instanceof Error ? e.message : String(e)));
      setProgress(100);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.nii') && !file.name.endsWith('.nii.gz')) {
      setStatusText('Invalid file type. Please upload a .nii or .nii.gz file.');
      return;
    }

    setStatusText('Submitting job...');
    setProgress(10);

    try {
      const jobId = await submit(file);
      setStatusText(`Job ${jobId.slice(0, 8)}... submitted. Waiting for results...`);
      setProgress(30);

      startPolling(jobId, handleComplete);
    } catch (e) {
      setStatusText('Submit failed: ' + (e instanceof Error ? e.message : String(e)));
      setProgress(0);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'COMPLETED': return 'var(--green, #10b981)';
      case 'FAILED':    return 'var(--red, #ef4444)';
      case 'RUNNING':   return 'var(--cyan, #06b6d4)';
      case 'QUEUED':    return 'var(--yellow, #f59e0b)';
      default:          return 'var(--muted)';
    }
  };

  return (
    <div className="card inference-panel">
      <div className="card-title">Async Inference</div>

      {models.length > 0 && (
        <div className="model-selector">
          <label htmlFor="model-select">Model:</label>
          <select
            id="model-select"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.version}) — {m.backend}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        className={`drop-zone ${dragging ? 'active' : ''} ${polling ? 'disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !polling && fileRef.current?.click()}
      >
        <div className="drop-icon">{polling ? '⏳' : '📁'}</div>
        <div className="drop-text">
          {polling ? 'Processing...' : 'Drop .nii.gz file here or click to browse'}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".nii,.nii.gz"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {statusText && (
        <div className="upload-status">
          {progress > 0 && progress < 100 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          <div className="status-text">{statusText}</div>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="job-history">
          <div className="job-history-title">Recent Jobs</div>
          <div className="job-list">
            {jobs.slice(0, 5).map((j) => (
              <div key={j.jobId} className="job-item">
                <span className="job-id">{j.jobId.slice(0, 8)}</span>
                <span className="job-file">{j.fileName ?? '—'}</span>
                <span className="job-status" style={{ color: statusColor(j.status) }}>
                  {j.status}
                </span>
                {j.elapsedMs != null && (
                  <span className="job-time">{(j.elapsedMs / 1000).toFixed(1)}s</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
