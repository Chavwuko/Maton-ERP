import { apiClient } from './client';
import { getAuthMode } from '../auth/authMode';
import { getCurrentRole } from '../auth/roleStore';
import type { AppDocument, DocumentStatus } from '../modules/document-control/types';

// AUTH_MODE=cognito carries identity in the erp_session cookie instead.
function authHeaders(): Record<string, string> {
  return getAuthMode() === 'local' ? { 'x-local-role': getCurrentRole() } : {};
}

export interface CreateDocumentFields {
  organizationId: string;
  title: string;
  departmentId?: string;
  projectId?: string;
  workOrderId?: string;
  invoiceId?: string;
  incidentId?: string;
  employeeId?: string;
  description?: string;
  category?: string;
}

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export function listDocuments(
  filters: {
    organizationId?: string;
    status?: DocumentStatus;
    departmentId?: string;
    projectId?: string;
    workOrderId?: string;
    invoiceId?: string;
    incidentId?: string;
    employeeId?: string;
  } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<AppDocument[]>(`/documents${qs ? `?${qs}` : ''}`);
}

export function getDocument(id: string) {
  return apiClient.get<AppDocument>(`/documents/${id}`);
}

// Multipart routes bypass apiClient (which always sends Content-Type:
// application/json) — the browser sets the correct multipart boundary
// itself as long as we don't set Content-Type manually.
export async function createDocument(fields: CreateDocumentFields, file: File): Promise<AppDocument> {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) form.set(key, value);
  });
  form.set('file', file);

  const res = await fetch(`${BASE_URL}/documents`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body: { message?: string | string[] } | null = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function addDocumentVersion(documentId: string, file: File): Promise<AppDocument> {
  const form = new FormData();
  form.set('file', file);

  const res = await fetch(`${BASE_URL}/documents/${documentId}/versions`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body: { message?: string | string[] } | null = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

export function getDownloadUrl(documentId: string, versionId: string) {
  return apiClient.get<{ url: string; fileName: string }>(`/documents/${documentId}/versions/${versionId}/download`);
}

export function submitForReview(documentId: string, reviewerIds: string[]) {
  return apiClient.post<AppDocument>(`/documents/${documentId}/submit`, { reviewerIds });
}

export function recordDecision(documentId: string, status: 'APPROVED' | 'REJECTED', comment?: string) {
  return apiClient.post<AppDocument>(`/documents/${documentId}/review`, { status, comment });
}
