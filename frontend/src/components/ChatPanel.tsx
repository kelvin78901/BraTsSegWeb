import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useViewerStore } from '../store/viewerStore';
import { usePatientRecordStore } from '../store/patientRecordStore';
import { apiPost, apiFetch } from '../api/client';
import { renderMarkdown } from '../lib/markdown';
import './ChatPanel.css';

interface Message {
  role: 'user' | 'ai';
  html: string;
}

interface AiModel {
  id: string;
  displayName: string;
  description: string;
}

const WELCOME_MD = `### Welcome to SmartMed AI Assistant
I can help you with:
- **Imaging analysis** of loaded MRI scans
- **Structured consults** with differential diagnosis (RAG-grounded)
- **Self-check** to verify system connectivity

Type a message or use the action buttons below.`;

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', html: renderMarkdown(WELCOME_MD) },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const caseId = useViewerStore((s) => s.caseId);
  const aiBackground = useViewerStore((s) => s.aiBackground);
  const setAiBackground = useViewerStore((s) => s.setAiBackground);
  const aiModel = useViewerStore((s) => s.aiModel);
  const setAiModel = useViewerStore((s) => s.setAiModel);
  const token = useAuthStore((s) => s.token);
  const getRecord = usePatientRecordStore((s) => s.getRecord);

  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);

  useEffect(() => {
    apiFetch<{ ok: boolean; data?: { models: AiModel[]; default: string } }>('/api/ai/models')
      .then((res) => {
        if (res?.data?.models) {
          setAvailableModels(res.data.models);
          if (!aiModel && res.data.default) {
            setAiModel(res.data.default);
          }
        }
      })
      .catch(() => {});
  }, []);

  const scrollBottom = () => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  };

  useEffect(scrollBottom, [messages, typing]);

  const addMsg = (role: 'user' | 'ai', text: string) => {
    setMessages((prev) => [...prev, { role, html: renderMarkdown(text) }]);
  };

  const buildPatientContext = (): string => {
    const record = getRecord(caseId);
    if (!record) return '';

    const s: string[] = [];
    s.push(`## Patient: ${record.name}`);
    s.push(`Case: ${record.caseId} | Age: ${record.age} | Gender: ${record.gender} | Blood: ${record.bloodType}`);
    s.push(`MRN: ${record.medicalRecordNumber || 'N/A'} | Height: ${record.height ?? 'N/A'} cm | Weight: ${record.weight ?? 'N/A'} kg`);
    s.push(`Admission: ${record.admissionDate} | Diagnosis: ${record.primaryDiagnosis}`);

    if (record.chiefComplaint) s.push(`\n### Chief Complaint\n${record.chiefComplaint}`);
    if (record.presentIllness) s.push(`\n### History of Present Illness\n${record.presentIllness}`);

    if (record.tumorInfo) {
      const t = record.tumorInfo;
      s.push(`\n### Tumor Information`);
      s.push(`Location: ${t.location} | Laterality: ${t.laterality} | Size: ${t.size}`);
      s.push(`WHO Grade: ${t.whoGrade} | Histology: ${t.histology} | KPS: ${t.kps}`);
      if (t.molecularMarkers) {
        s.push(`Molecular Markers: ${Object.entries(t.molecularMarkers).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
    }

    if (record.treatmentPlans?.length) {
      s.push(`\n### Treatment Plans`);
      record.treatmentPlans.forEach((tp) => {
        s.push(`- ${tp.name} (${tp.type}, ${tp.status}): ${tp.protocol || ''} ${tp.notes || ''}`);
      });
    }

    if (record.medications?.length) {
      s.push(`\n### Current Medications`);
      record.medications.forEach((m) => {
        s.push(`- ${m.name} ${m.dosage} ${m.frequency}${m.notes ? ` (${m.notes})` : ''}`);
      });
    }

    if (record.labResults?.length) {
      s.push(`\n### Lab Results`);
      record.labResults.forEach((l) => {
        s.push(`- [${l.date}] ${l.testName}: ${l.value} ${l.unit} (ref: ${l.referenceRange})${l.abnormal ? ' ABNORMAL' : ''}`);
      });
    }

    if (record.imagingStudies?.length) {
      s.push(`\n### Imaging Studies`);
      record.imagingStudies.forEach((im) => {
        s.push(`- [${im.date}] ${im.modality}: ${im.impression}`);
      });
    }

    if (record.allergies?.length) {
      s.push(`\n### Allergies`);
      record.allergies.forEach((a) => s.push(`- ${a.allergen}: ${a.reaction} (${a.severity})`));
    }

    if (record.comorbidities?.length) {
      s.push(`\n### Comorbidities`);
      record.comorbidities.forEach((c) => s.push(`- ${c.condition} (onset: ${c.onset}, ${c.status})`));
    }

    if (record.familyHistory) s.push(`\n### Family History\n${record.familyHistory}`);
    if (record.socialHistory) s.push(`\n### Social History\n${record.socialHistory}`);

    if (record.visits?.length) {
      s.push(`\n### Visit History`);
      record.visits.forEach((v) => s.push(`- [${v.date}] ${v.department} - ${v.doctor}: ${v.diagnosis}`));
    }

    if (record.files?.length) {
      s.push(`\n### Uploaded Documents`);
      record.files.forEach((f) => s.push(`- ${f.name} (${f.type})`));
    }

    return s.join('\n');
  };

  const sendChat = async () => {
    const v = input.trim();
    if (!v) return;
    addMsg('user', v);
    setInput('');
    setTyping(true);

    try {
      const payload: Record<string, string> = { caseId, message: v };
      if (aiBackground) payload.background = aiBackground;
      if (aiModel) payload.model = aiModel;

      const data = await apiPost<{ ok: boolean; reply?: string; error?: unknown }>(
        '/api/agent/chat', payload
      );
      if (data.ok) {
        addMsg('ai', data.reply || '(empty reply)');
      } else {
        const err = data.error;
        const errMsg = typeof err === 'string' ? err
          : (err && typeof err === 'object' && 'message' in err) ? String((err as Record<string,unknown>).message)
          : 'AI chat failed.';
        addMsg('ai', errMsg);
      }
    } catch (e) {
      addMsg('ai', 'Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTyping(false);
    }
  };

  const runConsult = async () => {
    const v = input.trim();
    if (!v) return;
    addMsg('user', `[Consult] ${v}`);
    setInput('');
    setTyping(true);

    try {
      const patientContext = buildPatientContext();
      const payload: Record<string, unknown> = {
        caseId, question: v, sliceZ: 78,
        patientContext,
      };
      if (aiBackground) payload.background = aiBackground;
      if (aiModel) payload.model = aiModel;

      const data = await apiPost<{ ok: boolean; answer?: Record<string, unknown>; rawText?: string; error?: unknown }>(
        '/api/ai/consult', payload
      );
      if (!data.ok) {
        const err = data.error;
        const errMsg = typeof err === 'string' ? err
          : (err && typeof err === 'object' && 'message' in err) ? String((err as Record<string,unknown>).message)
          : 'Consult failed.';
        addMsg('ai', errMsg);
        return;
      }

      const ans = data.answer || {};
      const parts: string[] = [];
      const arr = (k: string) => (ans[k] as string[]) || [];
      const objArr = (k: string) => (ans[k] as Record<string, string>[]) || [];

      if (arr('key_imaging_findings').length)
        parts.push(`### Key Findings\n- ${arr('key_imaging_findings').join('\n- ')}`);
      if (objArr('differential').length) {
        const d = objArr('differential').map((x) => `- **${x.diagnosis}** (${x.confidence || 'n/a'}): ${x.supporting || ''}`);
        parts.push(`### Differential\n${d.join('\n')}`);
      }
      if (objArr('recommended_next_steps').length) {
        const n = objArr('recommended_next_steps').map((x) => `- ${x.priority || ''} ${x.action || ''} ${x.rationale ? `(${x.rationale})` : ''}`.trim());
        parts.push(`### Next Steps\n${n.join('\n')}`);
      }
      if (arr('red_flags').length) parts.push(`### Red Flags\n- ${arr('red_flags').join('\n- ')}`);
      if (arr('limitations').length) parts.push(`### Limitations\n- ${arr('limitations').join('\n- ')}`);

      addMsg('ai', parts.length ? parts.join('\n\n') : (data.rawText as string || 'Consult response received.'));
    } catch (e) {
      addMsg('ai', 'Consult error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTyping(false);
    }
  };

  const runSelfCheck = async () => {
    addMsg('ai', 'Running self-check...');
    try {
      const d = await apiFetch<Record<string, Record<string, unknown>>>('/api/ai/selfcheck?testGemini=true');
      const sOk = d?.sidecar?.ok ? 'OK' : 'FAIL';
      const gOk = d?.gemini?.tested ? 'OK' : 'FAIL';
      addMsg('ai', `### Self-Check Results\n- **Sidecar**: ${sOk}\n- **Gemini**: ${gOk}\n- Model: ${d?.gemini?.model || '--'}`);
    } catch (e) {
      addMsg('ai', 'Self-check error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const prepareBackground = async () => {
    if (!caseId) { addMsg('ai', 'Please load a case first.'); return; }
    addMsg('ai', 'Preparing AI background report...');
    setTyping(true);
    try {
      const payload: Record<string, string> = { caseId };
      if (aiModel) payload.model = aiModel;

      const data = await apiPost<{ ok: boolean; background?: string; error?: string }>(
        '/api/ai/background', payload
      );
      if (data.ok && data.background) {
        setAiBackground(data.background);
        addMsg('ai', '### Background Report Ready\n' + data.background);
      } else {
        addMsg('ai', data.error || 'Failed to prepare background.');
      }
    } catch (e) {
      addMsg('ai', 'Background error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="chat-panel card">
      <div className="card-title">AI Clinical Assistant</div>

      <div className="model-selector">
        <label>Model:</label>
        <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
          {availableModels.length === 0 && <option value="">Loading models...</option>}
          {availableModels.map((m) => (
            <option key={m.id} value={m.id} title={m.description}>{m.displayName}</option>
          ))}
        </select>
      </div>

      <div className="chat-actions">
        <button className="btn btn-sm" onClick={runSelfCheck}>Self-Check</button>
        <button className="btn btn-sm" onClick={prepareBackground}>Prepare BG</button>
      </div>

      <div className="chat-messages" ref={chatRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="md-content" dangerouslySetInnerHTML={{ __html: m.html }} />
          </div>
        ))}
        {typing && (
          <div className="typing-dots">
            <span className="dot" /><span className="dot" /><span className="dot" />
          </div>
        )}
      </div>

      <div className="chat-input-row">
        <input
          className="input chat-input"
          placeholder="Ask about imaging findings..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
        />
        <button className="btn btn-primary btn-sm" onClick={sendChat}>Send</button>
        <button className="btn btn-sm" onClick={runConsult}>Consult</button>
      </div>
    </div>
  );
}
