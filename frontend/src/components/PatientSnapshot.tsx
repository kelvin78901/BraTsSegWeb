import { useAuthStore } from '../store/authStore';

export default function PatientSnapshot() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="card">
      <div className="card-title">Patient Snapshot</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
        <div>
          <span style={{ color: 'var(--muted)' }}>Name</span>
          <div style={{ color: 'var(--bright)', fontWeight: 600 }}>
            {user?.displayName || 'Guest Patient'}
          </div>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>MRN</span>
          <div style={{ color: 'var(--bright)' }}>MRN-20240701</div>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>DOB / Sex</span>
          <div>1985-03-12 / Male</div>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>Diagnosis</span>
          <div style={{ color: 'var(--amber)' }}>Glioblastoma (GBM), WHO IV</div>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>Attending</span>
          <div>Dr. Alina Moretti (Neuro-oncology)</div>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>Care Team</span>
          <div>Radiation Oncology, Neuropathology</div>
        </div>
      </div>

      <div style={{ marginTop: '12px', padding: '8px', background: 'var(--bg2)', borderRadius: '6px', fontSize: '12px' }}>
        <div style={{ color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px' }}>
          Key Findings
        </div>
        <ul style={{ paddingLeft: '16px', margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          <li>Right temporal lobe mass, 4.2 × 3.8 cm</li>
          <li>Heterogeneous enhancement with central necrosis</li>
          <li>Peri-tumoral edema extending to insula</li>
          <li>No midline shift; ventricles non-dilated</li>
        </ul>
      </div>
    </div>
  );
}
