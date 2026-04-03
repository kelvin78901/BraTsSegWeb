const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function getToken(): string | null {
  return localStorage.getItem('salynt_token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiFetch<T = unknown>(
  url: string,
  opts: RequestInit = {},
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { ...authHeaders(), ...opts.headers },
      });

      if (res.status === 401) {
        localStorage.removeItem('salynt_token');
        localStorage.removeItem('salynt_user');
        window.location.href = '/login';
        throw new Error('Session expired');
      }

      if (RETRYABLE_STATUSES.has(res.status) && attempt < retries) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }

      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json() as Promise<T>;
      return res.text() as unknown as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (lastError.message === 'Session expired') throw lastError;
      if (attempt < retries) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error('API request failed');
}

export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  extra: RequestInit = {}
): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra.headers },
    body: JSON.stringify(body),
    ...extra,
  });
}

export async function apiUpload<T = unknown>(
  url: string,
  form: FormData
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json() as Promise<T>;
}
