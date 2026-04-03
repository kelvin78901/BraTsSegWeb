import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';

describe('apiFetch – retry logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('salynt_token', 'test-token');
  });

  it('returns data on a successful request', async () => {
    const mockData = { ok: true, message: 'hello' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await apiFetch('/api/test');
    expect(result).toEqual(mockData);
  });

  it('retries on 503 then succeeds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 503 }));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await apiFetch('/api/retry-test', {}, 2);
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));

    await expect(apiFetch('/api/fail', {}, 1)).rejects.toThrow('API 500');
  });
});
