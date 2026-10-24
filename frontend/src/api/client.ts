import { getAuthMode } from '../auth/authMode';
import { getCurrentRole } from '../auth/roleStore';
import { getSignupPreviewEmail } from '../auth/signupPreviewStore';

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Sends the request with the identity the backend expects and turns any
// non-2xx answer into an ApiError, so callers only see successful responses.
async function send(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  // AUTH_MODE=cognito carries identity in the erp_session cookie
  // (credentials: 'include' below) instead of this dev-only header.
  if (getAuthMode() === 'local') {
    headers['x-local-role'] = getCurrentRole();
    // Local-only sign-up preview: act as a brand-new self-registered user.
    const previewEmail = getSignupPreviewEmail();
    if (previewEmail) headers['x-local-signup'] = previewEmail;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body: { message?: string | string[] } | null = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(res.status, message ?? `Request failed with status ${res.status}`);
  }

  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// A file the API produces (a CSV export): its text and the name it suggests.
async function download(path: string): Promise<{ filename: string; text: string }> {
  const res = await send(path);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'download.csv';
  return { filename, text: await res.text() };
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  download,
};
