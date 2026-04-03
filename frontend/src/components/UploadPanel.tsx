import { useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useViewerStore } from '../store/viewerStore';
import { loadNifti } from '../lib/niftiLoader';
import './UploadPanel.css';

export default function UploadPanel() {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);
  const caseId = useViewerStore((s) => s.caseId);
  const setMri = useViewerStore((s) => s.setMri);
  const setPred = useViewerStore((s) => s.setPred);
  const setMetrics = useViewerStore((s) => s.setMetrics);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.nii') && !file.name.endsWith('.nii.gz')) {
      setStatus('Invalid file type. Please upload a .nii or .nii.gz file.');
      return;
    }

    setStatus('Uploading...');
    setProgress(20);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('model', useViewerStore.getState().model || 'nnunet_v2');

      const res = await fetch('/api/auth/upload-segment', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      setProgress(60);

      if (!res.ok) {
        const err = await res.text();
        setStatus(`Upload failed: ${err}`);
        return;
      }

      const data = await res.json();
      setStatus('Processing segmentation...');
      setProgress(80);

      if (data.mriUrl) {
        const mri = await loadNifti(data.mriUrl);
        setMri(mri);
      }
      if (data.predUrl) {
        const pred = await loadNifti(data.predUrl);
        setPred(pred);
      }
      if (data.metrics) {
        setMetrics(data.metrics);
      }

      setProgress(100);
      setStatus('Segmentation complete!');
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="card upload-panel">
      <div className="card-title">Upload MRI Scan</div>

      <div
        className={`drop-zone ${dragging ? 'active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div className="drop-icon">📁</div>
        <div className="drop-text">Drop .nii.gz file here or click to browse</div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".nii,.nii.gz"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {status && (
        <div className="upload-status">
          {progress > 0 && progress < 100 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          <div className="status-text">{status}</div>
        </div>
      )}
    </div>
  );
}
