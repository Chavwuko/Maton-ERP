import { apiClient } from './client';
import type { MilestoneStatus, Project, ProjectMilestone, ProjectStatus } from '../modules/projects/types';

export function listProjects(filters: { organizationId?: string; status?: ProjectStatus } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiClient.get<Project[]>(`/projects${qs ? `?${qs}` : ''}`);
}

export function getProject(id: string) {
  return apiClient.get<Project>(`/projects/${id}`);
}

export function createProject(data: {
  organizationId: string;
  code: string;
  name: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
}) {
  return apiClient.post<Project>('/projects', data);
}

export function updateProjectStatus(id: string, status: ProjectStatus) {
  return apiClient.patch<Project>(`/projects/${id}/status`, { status });
}

export function listMilestones(projectId: string) {
  return apiClient.get<ProjectMilestone[]>(`/projects/${projectId}/milestones`);
}

export function createMilestone(projectId: string, data: { name: string; dueDate: string; description?: string }) {
  return apiClient.post<ProjectMilestone>(`/projects/${projectId}/milestones`, data);
}

export function updateMilestone(
  projectId: string,
  milestoneId: string,
  data: { status?: MilestoneStatus; name?: string; description?: string; dueDate?: string },
) {
  return apiClient.patch<ProjectMilestone>(`/projects/${projectId}/milestones/${milestoneId}`, data);
}
