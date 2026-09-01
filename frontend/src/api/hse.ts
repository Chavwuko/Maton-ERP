import { apiClient } from './client';
import type {
  CorrectiveAction,
  CorrectiveActionStatus,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from '../modules/hse/types';

export function listIncidents(
  filters: {
    organizationId?: string;
    status?: IncidentStatus;
    type?: IncidentType;
    severity?: IncidentSeverity;
    projectId?: string;
    assetId?: string;
  } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<Incident[]>(`/incidents${qs ? `?${qs}` : ''}`);
}

export function getIncident(id: string) {
  return apiClient.get<Incident>(`/incidents/${id}`);
}

export function createIncident(data: {
  organizationId: string;
  title: string;
  type: IncidentType;
  severity: IncidentSeverity;
  occurredAt: string;
  description?: string;
  projectId?: string;
  assetId?: string;
  location?: string;
}) {
  return apiClient.post<Incident>('/incidents', data);
}

export function updateIncidentStatus(id: string, status: IncidentStatus) {
  return apiClient.patch<Incident>(`/incidents/${id}/status`, { status });
}

export function listCorrectiveActions(incidentId: string) {
  return apiClient.get<CorrectiveAction[]>(`/incidents/${incidentId}/corrective-actions`);
}

export function createCorrectiveAction(
  incidentId: string,
  data: { description: string; assignedToId: string; dueDate: string },
) {
  return apiClient.post<CorrectiveAction>(`/incidents/${incidentId}/corrective-actions`, data);
}

export function updateCorrectiveAction(
  incidentId: string,
  actionId: string,
  data: { status?: CorrectiveActionStatus; description?: string; assignedToId?: string; dueDate?: string },
) {
  return apiClient.patch<CorrectiveAction>(`/incidents/${incidentId}/corrective-actions/${actionId}`, data);
}
