import { apiClient } from './client';
import type { User } from '../modules/users/types';

export function listUsers(filters?: { role?: string | string[]; isActive?: boolean }) {
  const params = new URLSearchParams();
  for (const role of filters?.role ? (Array.isArray(filters.role) ? filters.role : [filters.role]) : []) {
    params.append('role', role);
  }
  if (filters?.isActive !== undefined) {
    params.set('isActive', String(filters.isActive));
  }
  const qs = params.toString();
  return apiClient.get<User[]>(`/users${qs ? `?${qs}` : ''}`);
}

export function getUser(id: string) {
  return apiClient.get<User>(`/users/${id}`);
}
