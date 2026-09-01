import { apiClient } from './client';
import type { Department, Organization } from '../types/api';

export function listOrganizations() {
  return apiClient.get<Organization[]>('/organizations');
}

export function getOrganization(id: string) {
  return apiClient.get<Organization>(`/organizations/${id}`);
}

export function createOrganization(data: { name: string }) {
  return apiClient.post<Organization>('/organizations', data);
}

export function createDepartment(data: { organizationId: string; code: string; name: string }) {
  return apiClient.post<Department>('/departments', data);
}

export function updateDepartment(id: string, data: { name?: string; code?: string }) {
  return apiClient.patch<Department>(`/departments/${id}`, data);
}
