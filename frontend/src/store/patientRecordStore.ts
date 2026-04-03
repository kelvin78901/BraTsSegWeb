import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_PATIENTS } from './patientMockData';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface Visit {
  id: string;
  date: string;
  department: string;
  doctor: string;
  diagnosis: string;
  notes?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;

  dataUrl?: string;
}

export interface TreatmentPlan {
  id: string;
  name: string;
  type: 'surgery' | 'chemotherapy' | 'radiation' | 'immunotherapy' | 'targeted' | 'supportive' | 'observation';
  status: 'planned' | 'active' | 'completed' | 'discontinued';
  startDate: string;
  endDate?: string;
  protocol?: string;
  cycles?: number;
  completedCycles?: number;
  responseAssessment?: string;
  notes?: string;
}

export interface LabResult {
  id: string;
  date: string;
  category: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  abnormal: boolean;
}

export interface TumorInfo {
  location: string;
  laterality: string;
  size: string;
  whoGrade: string;
  histology: string;
  molecularMarkers: Record<string, string>;
  kps: number;
}

export interface ImagingStudy {
  id: string;
  date: string;
  modality: string;
  sequences?: string[];
  findings: string;
  impression: string;
  linkedCaseId?: string;
}

export interface Allergy {
  id: string;
  allergen: string;
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface Comorbidity {
  id: string;
  condition: string;
  onset: string;
  status: 'active' | 'resolved' | 'controlled';
  notes?: string;
}

export interface PatientRecord {
  caseId: string;
  name: string;
  age: number;
  gender: 'M' | 'F';
  bloodType: string;
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  admissionDate: string;
  primaryDiagnosis: string;
  medications: Medication[];
  visits: Visit[];
  files: UploadedFile[];

  medicalRecordNumber: string;
  height: number;
  weight: number;
  chiefComplaint: string;
  presentIllness: string;
  familyHistory: string;
  socialHistory: string;
  tumorInfo: TumorInfo;
  treatmentPlans: TreatmentPlan[];
  labResults: LabResult[];
  imagingStudies: ImagingStudy[];
  allergies: Allergy[];
  comorbidities: Comorbidity[];
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface PatientRecordState {
  records: PatientRecord[];

  getRecord: (caseId: string) => PatientRecord | undefined;
  updateBasicInfo: (caseId: string, info: Partial<PatientRecord>) => void;
  addRecord: (record: PatientRecord) => void;
  deleteRecord: (caseId: string) => void;

  addMedication: (caseId: string, med: Omit<Medication, 'id'>) => void;
  updateMedication: (caseId: string, medId: string, med: Partial<Medication>) => void;
  deleteMedication: (caseId: string, medId: string) => void;

  addVisit: (caseId: string, visit: Omit<Visit, 'id'>) => void;
  updateVisit: (caseId: string, visitId: string, visit: Partial<Visit>) => void;
  deleteVisit: (caseId: string, visitId: string) => void;

  addFile: (caseId: string, file: UploadedFile) => void;
  deleteFile: (caseId: string, fileId: string) => void;

  addTreatmentPlan: (caseId: string, plan: Omit<TreatmentPlan, 'id'>) => void;
  deleteTreatmentPlan: (caseId: string, planId: string) => void;

  addLabResult: (caseId: string, result: Omit<LabResult, 'id'>) => void;
  deleteLabResult: (caseId: string, resultId: string) => void;

  addImagingStudy: (caseId: string, study: Omit<ImagingStudy, 'id'>) => void;
  deleteImagingStudy: (caseId: string, studyId: string) => void;

  addAllergy: (caseId: string, allergy: Omit<Allergy, 'id'>) => void;
  deleteAllergy: (caseId: string, allergyId: string) => void;

  addComorbidity: (caseId: string, comorbidity: Omit<Comorbidity, 'id'>) => void;
  deleteComorbidity: (caseId: string, comorbidityId: string) => void;

  updateTumorInfo: (caseId: string, info: Partial<TumorInfo>) => void;
}

export const usePatientRecordStore = create<PatientRecordState>()(
  persist(
    (set, get) => ({
      records: MOCK_PATIENTS,

      getRecord: (caseId) => get().records.find((r) => r.caseId === caseId),

      updateBasicInfo: (caseId, info) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId ? { ...r, ...info, caseId: r.caseId } : r
          ),
        })),

      addRecord: (record) =>
        set((s) => ({ records: [...s.records, record] })),

      deleteRecord: (caseId) =>
        set((s) => ({ records: s.records.filter((r) => r.caseId !== caseId) })),

      addMedication: (caseId, med) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, medications: [...r.medications, { ...med, id: uid() }] }
              : r
          ),
        })),

      updateMedication: (caseId, medId, med) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? {
                  ...r,
                  medications: r.medications.map((m) =>
                    m.id === medId ? { ...m, ...med } : m
                  ),
                }
              : r
          ),
        })),

      deleteMedication: (caseId, medId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, medications: r.medications.filter((m) => m.id !== medId) }
              : r
          ),
        })),

      addVisit: (caseId, visit) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, visits: [...r.visits, { ...visit, id: uid() }] }
              : r
          ),
        })),

      updateVisit: (caseId, visitId, visit) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? {
                  ...r,
                  visits: r.visits.map((v) =>
                    v.id === visitId ? { ...v, ...visit } : v
                  ),
                }
              : r
          ),
        })),

      deleteVisit: (caseId, visitId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, visits: r.visits.filter((v) => v.id !== visitId) }
              : r
          ),
        })),

      addFile: (caseId, file) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId ? { ...r, files: [...r.files, file] } : r
          ),
        })),

      deleteFile: (caseId, fileId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, files: r.files.filter((f) => f.id !== fileId) }
              : r
          ),
        })),

      addTreatmentPlan: (caseId, plan) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, treatmentPlans: [...(r.treatmentPlans || []), { ...plan, id: uid() }] }
              : r
          ),
        })),

      deleteTreatmentPlan: (caseId, planId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, treatmentPlans: (r.treatmentPlans || []).filter((p) => p.id !== planId) }
              : r
          ),
        })),

      addLabResult: (caseId, result) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, labResults: [...(r.labResults || []), { ...result, id: uid() }] }
              : r
          ),
        })),

      deleteLabResult: (caseId, resultId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, labResults: (r.labResults || []).filter((l) => l.id !== resultId) }
              : r
          ),
        })),

      addImagingStudy: (caseId, study) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, imagingStudies: [...(r.imagingStudies || []), { ...study, id: uid() }] }
              : r
          ),
        })),

      deleteImagingStudy: (caseId, studyId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, imagingStudies: (r.imagingStudies || []).filter((s) => s.id !== studyId) }
              : r
          ),
        })),

      addAllergy: (caseId, allergy) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, allergies: [...(r.allergies || []), { ...allergy, id: uid() }] }
              : r
          ),
        })),

      deleteAllergy: (caseId, allergyId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, allergies: (r.allergies || []).filter((a) => a.id !== allergyId) }
              : r
          ),
        })),

      addComorbidity: (caseId, comorbidity) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, comorbidities: [...(r.comorbidities || []), { ...comorbidity, id: uid() }] }
              : r
          ),
        })),

      deleteComorbidity: (caseId, comorbidityId) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, comorbidities: (r.comorbidities || []).filter((c) => c.id !== comorbidityId) }
              : r
          ),
        })),

      updateTumorInfo: (caseId, info) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.caseId === caseId
              ? { ...r, tumorInfo: { ...r.tumorInfo, ...info } }
              : r
          ),
        })),
    }),
    {
      name: 'smartmed-patient-records',
      version: 2,
      migrate: (_persisted, version) => {

        if (version < 2) return { records: MOCK_PATIENTS };
        return _persisted as { records: PatientRecord[] };
      },
      partialize: (state) => ({ records: state.records }),
    }
  )
);
