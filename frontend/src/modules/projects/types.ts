export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'CLOSED';
export type MilestoneStatus = 'PENDING' | 'COMPLETED' | 'DELAYED';

export interface ProjectMilestone {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  dueDate: string;
  status: MilestoneStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  createdAt: string;
  updatedAt: string;
  milestones?: ProjectMilestone[];
}

export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNED: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['ON_HOLD', 'CLOSED'],
  ON_HOLD: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  PLANNED: 'blue',
  ACTIVE: 'green',
  ON_HOLD: 'orange',
  CLOSED: 'gray',
};

export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  PENDING: 'blue',
  COMPLETED: 'green',
  DELAYED: 'red',
};

// The backend places no ALLOWED_TRANSITIONS constraint on milestone status
// (UpdateMilestoneDto.status accepts any value) — this just drives the
// StatusMenu's "other options" list for a consistent click-to-change UI.
export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  PENDING: ['COMPLETED', 'DELAYED'],
  COMPLETED: ['PENDING', 'DELAYED'],
  DELAYED: ['PENDING', 'COMPLETED'],
};
