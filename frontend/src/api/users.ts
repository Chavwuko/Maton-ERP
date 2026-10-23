import { apiClient } from './client';
import type { User, UserStatus } from '../modules/users/types';

export function listUsers(filters?: { role?: string | string[]; isActive?: boolean; status?: UserStatus }) {
  const params = new URLSearchParams();
  for (const role of filters?.role ? (Array.isArray(filters.role) ? filters.role : [filters.role]) : []) {
    params.append('role', role);
  }
  if (filters?.isActive !== undefined) {
    params.set('isActive', String(filters.isActive));
  }
  if (filters?.status) {
    params.set('status', filters.status);
  }
  const qs = params.toString();
  return apiClient.get<User[]>(`/users${qs ? `?${qs}` : ''}`);
}

export function getUser(id: string) {
  return apiClient.get<User>(`/users/${id}`);
}

export function approveUser(id: string, data: { roleName: string; departmentId?: string }) {
  return apiClient.post<User>(`/users/${id}/approve`, data);
}

export function rejectUser(id: string, data: { reason?: string }) {
  return apiClient.post<User>(`/users/${id}/reject`, data);
}

export function disableUser(id: string) {
  return apiClient.post<User>(`/users/${id}/disable`, {});
}

export function enableUser(id: string) {
  return apiClient.post<User>(`/users/${id}/enable`, {});
}

export function updateUser(
  id: string,
  data: { firstName?: string; lastName?: string; phone?: string; roleName?: string; departmentId?: string },
) {
  return apiClient.patch<User>(`/users/${id}`, data);
}
