export type IncidentType = 'INJURY' | 'NEAR_MISS' | 'ENVIRONMENTAL' | 'PROPERTY_DAMAGE' | 'SECURITY';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'REPORTED' | 'UNDER_INVESTIGATION' | 'CORRECTIVE_ACTION' | 'CLOSED';
export type CorrectiveActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface CorrectiveAction {
  id: string;
  incidentId: string;
  description: string;
  assignedToId: string;
  dueDate: string;
  status: CorrectiveActionStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  organizationId: string;
  projectId: string | null;
  assetId: string | null;
  title: string;
  description: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurredAt: string;
  location: string | null;
  reportedById: string;
  createdAt: string;
  updatedAt: string;
  correctiveActions?: CorrectiveAction[];
}

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  REPORTED: ['UNDER_INVESTIGATION', 'CLOSED'],
  UNDER_INVESTIGATION: ['CORRECTIVE_ACTION', 'CLOSED'],
  CORRECTIVE_ACTION: ['CLOSED'],
  CLOSED: [],
};

export const INCIDENT_STATUS_COLORS: Record<IncidentStatus, string> = {
  REPORTED: 'blue',
  UNDER_INVESTIGATION: 'yellow',
  CORRECTIVE_ACTION: 'orange',
  CLOSED: 'gray',
};

export const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  LOW: 'green',
  MEDIUM: 'yellow',
  HIGH: 'orange',
  CRITICAL: 'red',
};

export const CORRECTIVE_ACTION_STATUS_COLORS: Record<CorrectiveActionStatus, string> = {
  PENDING: 'blue',
  IN_PROGRESS: 'yellow',
  COMPLETED: 'green',
};

// No backend ALLOWED_TRANSITIONS constraint on corrective action status —
// this just drives the StatusMenu's "other options" list.
export const CORRECTIVE_ACTION_TRANSITIONS: Record<CorrectiveActionStatus, CorrectiveActionStatus[]> = {
  PENDING: ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS: ['PENDING', 'COMPLETED'],
  COMPLETED: ['PENDING', 'IN_PROGRESS'],
};
