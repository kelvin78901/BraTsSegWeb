import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import {
  usePatientRecordStore,
  type PatientRecord,
  type Medication,
  type Visit,
  type TreatmentPlan,
  type LabResult,
  type TumorInfo,
  type ImagingStudy,
  type Allergy,
  type Comorbidity,
} from '../store/patientRecordStore';
import './PatientRecordPage.css';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PatientRecordPage() {
  const navigate = useNavigate();
  const records = usePatientRecordStore((s) => s.records);
  const [selectedCaseId, setSelectedCaseId] = useState(records[0]?.caseId || '');
  const record = usePatientRecordStore((s) => s.getRecord(selectedCaseId));

  return (
    <div className="record-page">
      <AppHeader />

      <div className="record-body">

        <aside className="record-list">
          <h3>Patient Records</h3>
          <ul>
            {records.map((r) => (
              <li
                key={r.caseId}
                className={r.caseId === selectedCaseId ? 'active' : ''}
                onClick={() => setSelectedCaseId(r.caseId)}
              >
                <span className="rl-name">{r.name}</span>
                <span className="rl-case">{r.caseId}</span>
              </li>
            ))}
          </ul>
          <button
            className="btn btn-sm"
            onClick={() => navigate(`/patient?case=${selectedCaseId}`)}
            disabled={!selectedCaseId}
          >
            Open in Viewer &rarr;
          </button>
        </aside>

        {record ? (
          <DetailPanel key={record.caseId} record={record} />
        ) : (
          <div className="record-empty">Select a patient from the left list.</div>
        )}
      </div>
    </div>
  );
}

type Tab = 'basic' | 'clinical' | 'meds' | 'visits' | 'files';

function DetailPanel({ record }: { record: PatientRecord }) {
  const [tab, setTab] = useState<Tab>('basic');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basic', label: 'Basic Info' },
    { key: 'clinical', label: 'Clinical' },
    { key: 'meds', label: `Medications (${record.medications.length})` },
    { key: 'visits', label: `Visits (${record.visits.length})` },
    { key: 'files', label: `Files (${record.files.length})` },
  ];

  return (
    <section className="record-detail">
      <div className="detail-header">
        <h2>{record.name}</h2>
        <span className="detail-case">{record.caseId}</span>
      </div>

      <nav className="detail-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="detail-content">
        {tab === 'basic' && <BasicInfoTab record={record} />}
        {tab === 'clinical' && <ClinicalTab record={record} />}
        {tab === 'meds' && <MedicationsTab record={record} />}
        {tab === 'visits' && <VisitsTab record={record} />}
        {tab === 'files' && <FilesTab record={record} />}
      </div>
    </section>
  );
}

function BasicInfoTab({ record }: { record: PatientRecord }) {
  const updateBasicInfo = usePatientRecordStore((s) => s.updateBasicInfo);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...record });

  const save = () => {
    updateBasicInfo(record.caseId, draft);
    setEditing(false);
  };

  const fields: { key: keyof PatientRecord; label: string; type?: string }[] = [
    { key: 'name', label: 'Full Name' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'gender', label: 'Gender' },
    { key: 'bloodType', label: 'Blood Type' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'address', label: 'Ward / Address' },
    { key: 'emergencyContact', label: 'Emergency Contact' },
    { key: 'admissionDate', label: 'Admission Date', type: 'date' },
    { key: 'primaryDiagnosis', label: 'Primary Diagnosis' },
  ];

  return (
    <div className="tab-basic">
      <div className="tab-actions">
        {editing ? (
          <>
            <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
            <button className="btn btn-sm" onClick={() => { setDraft({ ...record }); setEditing(false); }}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-sm" onClick={() => { setDraft({ ...record }); setEditing(true); }}>Edit</button>
        )}
      </div>

      <div className="info-grid">
        {fields.map(({ key, label, type }) => (
          <div className="info-field" key={key}>
            <label>{label}</label>
            {editing ? (
              key === 'gender' ? (
                <select
                  value={String(draft[key])}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value as 'M' | 'F' })}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              ) : (
                <input
                  type={type || 'text'}
                  value={String(draft[key] ?? '')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              )
            ) : (
              <span className="info-value">{String(record[key] ?? '—')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClinicalTab({ record }: { record: PatientRecord }) {
  const navigate = useNavigate();

  return (
    <div className="tab-clinical">

      {(record.chiefComplaint || record.presentIllness) && (
        <div className="clinical-section">
          <h3>Medical History</h3>
          {record.chiefComplaint && (
            <div className="clinical-field">
              <label>Chief Complaint</label>
              <p>{record.chiefComplaint}</p>
            </div>
          )}
          {record.presentIllness && (
            <div className="clinical-field">
              <label>History of Present Illness</label>
              <p className="hpi-text">{record.presentIllness}</p>
            </div>
          )}
        </div>
      )}

      {record.tumorInfo && (
        <div className="clinical-section">
          <h3>Tumor Information</h3>
          <div className="info-grid">
            <div className="info-field">
              <label>Location</label>
              <span className="info-value">{record.tumorInfo.location}</span>
            </div>
            <div className="info-field">
              <label>Laterality</label>
              <span className="info-value">{record.tumorInfo.laterality}</span>
            </div>
            <div className="info-field">
              <label>Size</label>
              <span className="info-value">{record.tumorInfo.size}</span>
            </div>
            <div className="info-field">
              <label>WHO Grade</label>
              <span className="info-value grade-badge">{record.tumorInfo.whoGrade}</span>
            </div>
            <div className="info-field">
              <label>Histology</label>
              <span className="info-value">{record.tumorInfo.histology}</span>
            </div>
            <div className="info-field">
              <label>KPS</label>
              <span className="info-value">{record.tumorInfo.kps}</span>
            </div>
          </div>

          {record.tumorInfo.molecularMarkers && Object.keys(record.tumorInfo.molecularMarkers).length > 0 && (
            <>
              <h4 className="sub-heading">Molecular Markers</h4>
              <table className="data-table marker-table">
                <thead>
                  <tr><th>Marker</th><th>Result</th></tr>
                </thead>
                <tbody>
                  {Object.entries(record.tumorInfo.molecularMarkers).map(([k, v]) => {
                    const isPositive = /mutant|amplified|lost|co-deleted|methylated/i.test(v);
                    return (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className={isPositive ? 'marker-positive' : ''}>{v}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {record.treatmentPlans && record.treatmentPlans.length > 0 && (
        <div className="clinical-section">
          <h3>Treatment Plans</h3>
          <div className="treatment-timeline">
            {record.treatmentPlans.map((tp) => (
              <div key={tp.id} className={`treatment-card status-${tp.status}`}>
                <div className="tp-header">
                  <span className="tp-name">{tp.name}</span>
                  <span className={`tp-badge tp-${tp.status}`}>{tp.status}</span>
                  <span className="tp-type">{tp.type}</span>
                </div>
                <div className="tp-dates">
                  {tp.startDate}{tp.endDate ? ` → ${tp.endDate}` : ''}
                  {tp.cycles ? ` | Cycles: ${tp.completedCycles ?? 0}/${tp.cycles}` : ''}
                </div>
                {tp.protocol && <div className="tp-protocol">{tp.protocol}</div>}
                {tp.notes && <div className="tp-notes">{tp.notes}</div>}
                {tp.responseAssessment && <div className="tp-response">Response: {tp.responseAssessment}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {record.labResults && record.labResults.length > 0 && (
        <div className="clinical-section">
          <h3>Lab Results</h3>
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Test</th><th>Value</th><th>Unit</th><th>Reference</th><th>Status</th></tr>
            </thead>
            <tbody>
              {record.labResults.map((l) => (
                <tr key={l.id} className={l.abnormal ? 'row-abnormal' : ''}>
                  <td>{l.date}</td>
                  <td>{l.testName}</td>
                  <td className={l.abnormal ? 'text-danger' : ''}>{l.value}</td>
                  <td>{l.unit}</td>
                  <td>{l.referenceRange}</td>
                  <td>{l.abnormal ? '⚠️ Abnormal' : '✓ Normal'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.imagingStudies && record.imagingStudies.length > 0 && (
        <div className="clinical-section">
          <h3>Imaging Studies</h3>
          {record.imagingStudies.map((im) => (
            <div key={im.id} className="imaging-card">
              <div className="img-header">
                <span className="img-date">{im.date}</span>
                <span className="img-modality">{im.modality}</span>
                {im.linkedCaseId && (
                  <button className="btn btn-xs btn-primary" onClick={() => navigate(`/patient?case=${im.linkedCaseId}`)}>
                    Open in Viewer →
                  </button>
                )}
              </div>
              {im.sequences && <div className="img-seq">Sequences: {im.sequences.join(', ')}</div>}
              <div className="img-findings"><strong>Findings:</strong> {im.findings}</div>
              <div className="img-impression"><strong>Impression:</strong> {im.impression}</div>
            </div>
          ))}
        </div>
      )}

      <div className="clinical-row">
        {record.allergies && record.allergies.length > 0 && (
          <div className="clinical-section clinical-half">
            <h3>Allergies</h3>
            {record.allergies.map((a) => (
              <div key={a.id} className={`allergy-chip severity-${a.severity}`}>
                <strong>{a.allergen}</strong>: {a.reaction} ({a.severity})
              </div>
            ))}
          </div>
        )}

        {record.comorbidities && record.comorbidities.length > 0 && (
          <div className="clinical-section clinical-half">
            <h3>Comorbidities</h3>
            {record.comorbidities.map((c) => (
              <div key={c.id} className="comorbidity-chip">
                <strong>{c.condition}</strong> (onset: {c.onset}, {c.status})
                {c.notes && <span className="cm-notes"> — {c.notes}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="clinical-row">
        {record.familyHistory && (
          <div className="clinical-section clinical-half">
            <h3>Family History</h3>
            <p>{record.familyHistory}</p>
          </div>
        )}
        {record.socialHistory && (
          <div className="clinical-section clinical-half">
            <h3>Social History</h3>
            <p>{record.socialHistory}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MedicationsTab({ record }: { record: PatientRecord }) {
  const { addMedication, updateMedication, deleteMedication } = usePatientRecordStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const emptyMed: Omit<Medication, 'id'> = {
    name: '', dosage: '', frequency: '', startDate: new Date().toISOString().slice(0, 10),
  };
  const [draft, setDraft] = useState<Omit<Medication, 'id'>>(emptyMed);
  const [editDraft, setEditDraft] = useState<Medication | null>(null);

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    addMedication(record.caseId, draft);
    setDraft(emptyMed);
    setShowAdd(false);
  };

  const startEdit = (med: Medication) => {
    setEditingId(med.id);
    setEditDraft({ ...med });
  };

  const saveEdit = () => {
    if (!editDraft) return;
    updateMedication(record.caseId, editDraft.id, editDraft);
    setEditingId(null);
    setEditDraft(null);
  };

  return (
    <div className="tab-meds">
      <div className="tab-actions">
        <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Medication'}
        </button>
      </div>

      {showAdd && (
        <div className="med-form card-inset">
          <h4>New Medication</h4>
          <div className="form-row">
            <input placeholder="Drug Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input placeholder="Dosage" value={draft.dosage} onChange={(e) => setDraft({ ...draft, dosage: e.target.value })} />
            <input placeholder="Frequency" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })} />
          </div>
          <div className="form-row">
            <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            <input type="date" placeholder="End Date" value={draft.endDate || ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value || undefined })} />
            <input placeholder="Notes" value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleAdd}>Save</button>
        </div>
      )}

      {record.medications.length === 0 ? (
        <p className="empty-hint">No medications recorded.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Drug</th><th>Dosage</th><th>Frequency</th><th>Start</th><th>End</th><th>Notes</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {record.medications.map((med) =>
              editingId === med.id && editDraft ? (
                <tr key={med.id} className="editing-row">
                  <td><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
                  <td><input value={editDraft.dosage} onChange={(e) => setEditDraft({ ...editDraft, dosage: e.target.value })} /></td>
                  <td><input value={editDraft.frequency} onChange={(e) => setEditDraft({ ...editDraft, frequency: e.target.value })} /></td>
                  <td><input type="date" value={editDraft.startDate} onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })} /></td>
                  <td><input type="date" value={editDraft.endDate || ''} onChange={(e) => setEditDraft({ ...editDraft, endDate: e.target.value || undefined })} /></td>
                  <td><input value={editDraft.notes || ''} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} /></td>
                  <td>
                    <button className="btn btn-xs btn-primary" onClick={saveEdit}>Save</button>
                    <button className="btn btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={med.id}>
                  <td>{med.name}</td>
                  <td>{med.dosage}</td>
                  <td>{med.frequency}</td>
                  <td>{med.startDate}</td>
                  <td>{med.endDate || '—'}</td>
                  <td className="notes-cell">{med.notes || '—'}</td>
                  <td>
                    <button className="btn btn-xs" onClick={() => startEdit(med)}>Edit</button>
                    <button className="btn btn-xs btn-danger" onClick={() => deleteMedication(record.caseId, med.id)}>Delete</button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VisitsTab({ record }: { record: PatientRecord }) {
  const { addVisit, updateVisit, deleteVisit } = usePatientRecordStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const emptyVisit: Omit<Visit, 'id'> = {
    date: new Date().toISOString().slice(0, 10), department: '', doctor: '', diagnosis: '',
  };
  const [draft, setDraft] = useState<Omit<Visit, 'id'>>(emptyVisit);
  const [editDraft, setEditDraft] = useState<Visit | null>(null);

  const handleAdd = () => {
    if (!draft.department.trim()) return;
    addVisit(record.caseId, draft);
    setDraft(emptyVisit);
    setShowAdd(false);
  };

  const startEdit = (v: Visit) => {
    setEditingId(v.id);
    setEditDraft({ ...v });
  };

  const saveEdit = () => {
    if (!editDraft) return;
    updateVisit(record.caseId, editDraft.id, editDraft);
    setEditingId(null);
    setEditDraft(null);
  };

  return (
    <div className="tab-visits">
      <div className="tab-actions">
        <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Visit'}
        </button>
      </div>

      {showAdd && (
        <div className="visit-form card-inset">
          <h4>New Visit Record</h4>
          <div className="form-row">
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <input placeholder="Department *" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            <input placeholder="Doctor" value={draft.doctor} onChange={(e) => setDraft({ ...draft, doctor: e.target.value })} />
          </div>
          <div className="form-row">
            <input placeholder="Diagnosis" value={draft.diagnosis} onChange={(e) => setDraft({ ...draft, diagnosis: e.target.value })} style={{ flex: 2 }} />
            <input placeholder="Notes" value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ flex: 1 }} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleAdd}>Save</button>
        </div>
      )}

      {record.visits.length === 0 ? (
        <p className="empty-hint">No visit records.</p>
      ) : (
        <div className="visit-timeline">
          {record.visits.map((v) =>
            editingId === v.id && editDraft ? (
              <div key={v.id} className="visit-card editing">
                <div className="form-row">
                  <input type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                  <input placeholder="Department" value={editDraft.department} onChange={(e) => setEditDraft({ ...editDraft, department: e.target.value })} />
                  <input placeholder="Doctor" value={editDraft.doctor} onChange={(e) => setEditDraft({ ...editDraft, doctor: e.target.value })} />
                </div>
                <div className="form-row">
                  <input placeholder="Diagnosis" value={editDraft.diagnosis} onChange={(e) => setEditDraft({ ...editDraft, diagnosis: e.target.value })} style={{ flex: 2 }} />
                  <input placeholder="Notes" value={editDraft.notes || ''} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="visit-actions">
                  <button className="btn btn-xs btn-primary" onClick={saveEdit}>Save</button>
                  <button className="btn btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={v.id} className="visit-card">
                <div className="visit-date">{v.date}</div>
                <div className="visit-body">
                  <div className="visit-dept">{v.department}</div>
                  <div className="visit-doctor">{v.doctor}</div>
                  <div className="visit-diag">{v.diagnosis}</div>
                  {v.notes && <div className="visit-notes">{v.notes}</div>}
                </div>
                <div className="visit-actions">
                  <button className="btn btn-xs" onClick={() => startEdit(v)}>Edit</button>
                  <button className="btn btn-xs btn-danger" onClick={() => deleteVisit(record.caseId, v.id)}>Delete</button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function FilesTab({ record }: { record: PatientRecord }) {
  const { addFile, deleteFile } = usePatientRecordStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach((f) => {
        const reader = new FileReader();
        reader.onload = () => {
          addFile(record.caseId, {
            id: uid(),
            name: f.name,
            size: f.size,
            type: f.type,
            uploadedAt: new Date().toISOString(),
            dataUrl: reader.result as string,
          });
        };
        reader.readAsDataURL(f);
      });

      if (inputRef.current) inputRef.current.value = '';
    },
    [record.caseId, addFile]
  );

  const downloadFile = (f: { dataUrl?: string; name: string }) => {
    if (!f.dataUrl) return;
    const a = document.createElement('a');
    a.href = f.dataUrl;
    a.download = f.name;
    a.click();
  };

  return (
    <div className="tab-files">
      <div className="tab-actions">
        <button className="btn btn-sm btn-primary" onClick={() => inputRef.current?.click()}>
          + Upload File
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={handleUpload} />
      </div>

      {record.files.length === 0 ? (
        <p className="empty-hint">No files uploaded. Click "Upload File" to add documents, reports, or images.</p>
      ) : (
        <div className="file-grid">
          {record.files.map((f) => (
            <div key={f.id} className="file-card">
              <div className="file-icon">
                {f.type.startsWith('image/') ? '🖼️' : f.type.includes('pdf') ? '📄' : '📎'}
              </div>
              <div className="file-info">
                <div className="file-name" title={f.name}>{f.name}</div>
                <div className="file-meta">{fmtSize(f.size)} · {new Date(f.uploadedAt).toLocaleDateString()}</div>
              </div>
              <div className="file-actions">
                <button className="btn btn-xs" onClick={() => downloadFile(f)}>Download</button>
                <button className="btn btn-xs btn-danger" onClick={() => deleteFile(record.caseId, f.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
