import { apiFetch, apiUpload } from './client';

export interface InferJob {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  fileName?: string;
  modelId?: string;
  elapsedMs?: number;
  error?: string;
  images?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  backend: string;
  active: boolean;
  metrics?: Record<string, unknown>;
}

export async function submitInference(
  file: File,
  modelId?: string
): Promise<{ jobId: string; status: string; modelId: string }> {
  const form = new FormData();
  form.append('file', file);
  if (modelId) form.append('modelId', modelId);
  return apiUpload('/api/infer/submit', form);
}

export async function pollJobStatus(jobId: string): Promise<InferJob> {
  const res = await apiFetch<{ ok: boolean } & InferJob>(`/api/infer/status/${jobId}`);
  return res;
}

export async function getJobResult(jobId: string): Promise<InferJob> {
  const res = await apiFetch<{ ok: boolean } & InferJob>(`/api/infer/result/${jobId}`);
  return res;
}

export async function listMyJobs(): Promise<InferJob[]> {
  const res = await apiFetch<{ ok: boolean; jobs: InferJob[] }>('/api/infer/jobs');
  return res.jobs ?? [];
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await apiFetch<{ ok: boolean; models: ModelInfo[] }>('/api/models');
  return res.models ?? [];
}
