import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/roleStore', () => ({
  getCurrentRole: () => 'admin',
}));

function jsonResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('GET sends the x-local-role header and returns the parsed body', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'org-1' }));
    const { apiClient } = await import('./client');

    const result = await apiClient.get('/organizations/org-1');

    expect(result).toEqual({ id: 'org-1' });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('http://localhost:3000/organizations/org-1');
    expect((init?.headers as Record<string, string>)['x-local-role']).toBe('admin');
  });

  it('POST sends the method and JSON-stringified body', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'org-1', name: 'Acme' }));
    const { apiClient } = await import('./client');

    await apiClient.post('/organizations', { name: 'Acme' });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ name: 'Acme' }));
  });

  it('PATCH sends the method and JSON-stringified body', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'dept-1' }));
    const { apiClient } = await import('./client');

    await apiClient.patch('/departments/dept-1', { name: 'Finance' });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ name: 'Finance' }));
  });

  it('returns undefined for a 204 response without reading a body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const { apiClient } = await import('./client');

    await expect(apiClient.get('/documents/doc-1')).resolves.toBeUndefined();
  });

  it('throws an ApiError carrying the status and message on a non-2xx response', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ message: 'Organization not-found not found' }, { status: 404 })),
    );
    const { apiClient, ApiError } = await import('./client');

    await expect(apiClient.get('/organizations/not-found')).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.get('/organizations/not-found')).rejects.toMatchObject({
      status: 404,
      message: 'Organization not-found not found',
    });
  });

  it('joins an array of validation messages into one string', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: ['name should not be empty', 'code must be a string'] }, { status: 400 }),
    );
    const { apiClient } = await import('./client');

    await expect(apiClient.post('/departments', {})).rejects.toMatchObject({
      message: 'name should not be empty, code must be a string',
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    const notJson = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    vi.mocked(fetch).mockResolvedValue(notJson);
    const { apiClient } = await import('./client');

    await expect(apiClient.get('/organizations')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed with status 502',
    });
  });
});
