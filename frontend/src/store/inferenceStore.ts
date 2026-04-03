import { create } from 'zustand';
import type { InferJob, ModelInfo } from '../api/inference';
import {
  submitInference,
  pollJobStatus,
  getJobResult,
  listMyJobs,
  listModels,
} from '../api/inference';

interface InferenceState {

  models: ModelInfo[];
  selectedModelId: string;

  jobs: InferJob[];
  activeJobId: string | null;
  polling: boolean;

  setSelectedModelId: (id: string) => void;
  fetchModels: () => Promise<void>;
  fetchJobs: () => Promise<void>;
  submit: (file: File) => Promise<string>;
  startPolling: (jobId: string, onComplete: (job: InferJob) => void) => void;
  stopPolling: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useInferenceStore = create<InferenceState>()((set, get) => ({
  models: [],
  selectedModelId: 'default',
  jobs: [],
  activeJobId: null,
  polling: false,

  setSelectedModelId: (id) => set({ selectedModelId: id }),

  fetchModels: async () => {
    try {
      const models = await listModels();
      set({ models });
    } catch {

    }
  },

  fetchJobs: async () => {
    try {
      const jobs = await listMyJobs();
      set({ jobs });
    } catch {

    }
  },

  submit: async (file: File) => {
    const { selectedModelId } = get();
    const res = await submitInference(file, selectedModelId);
    const jobId = res.jobId;
    set({ activeJobId: jobId });

    get().fetchJobs();
    return jobId;
  },

  startPolling: (jobId, onComplete) => {

    get().stopPolling();
    set({ polling: true, activeJobId: jobId });

    const poll = async () => {
      try {
        const status = await pollJobStatus(jobId);

        set((s) => ({
          jobs: s.jobs.map((j) => (j.jobId === jobId ? { ...j, ...status } : j)),
        }));

        if (status.status === 'COMPLETED') {
          get().stopPolling();
          try {
            const result = await getJobResult(jobId);
            set((s) => ({
              jobs: s.jobs.map((j) => (j.jobId === jobId ? { ...j, ...result } : j)),
            }));
            onComplete(result);
          } catch {
            onComplete(status);
          }
        } else if (status.status === 'FAILED') {
          get().stopPolling();
          onComplete(status);
        }
      } catch {

      }
    };

    poll();
    pollTimer = setInterval(poll, 2000);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    set({ polling: false });
  },
}));
