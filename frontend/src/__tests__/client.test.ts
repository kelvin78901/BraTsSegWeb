import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { apiFetch } = await import('../api/client');

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('sends Authorization header when token exists', async () => {
    localStorage.setItem('salynt_token', 'test-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ ok: true }),
    });

    await apiFetch('/api/test');
    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders['Authorization']).toBe('Bearer test-token');
  });

  it('retries on 500 status', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ ok: true }),
      });

    const result = await apiFetch('/api/test');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('throws after exhausting retries', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' });

    await expect(apiFetch('/api/test', {}, 1)).rejects.toThrow('API 503');
  });
});
