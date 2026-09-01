export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type AppraisalCycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type AppraisalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type AppraisalRelationType = 'SELF' | 'MANAGER' | 'PEER' | 'SUBORDINATE';
export type AppraisalReviewStatus = 'PENDING' | 'SUBMITTED';

export interface Employee {
  id: string;
  organizationId: string;
  userId: string;
  employeeNumber: string;
  jobTitle: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
  manager?: Employee | null;
  directReports?: Employee[];
}

export interface AppraisalReviewer {
  id: string;
  appraisalId: string;
  reviewerId: string;
  relationType: AppraisalRelationType;
  status: AppraisalReviewStatus;
  rating: number | null;
  comments: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface Appraisal {
  id: string;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  status: AppraisalStatus;
  overallRating: string | null;
  createdAt: string;
  updatedAt: string;
  reviewers?: AppraisalReviewer[];
}

export interface AppraisalCycle {
  id: string;
  organizationId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AppraisalCycleStatus;
  createdAt: string;
  updatedAt: string;
  appraisals?: Appraisal[];
}

export const APPRAISAL_CYCLE_TRANSITIONS: Record<AppraisalCycleStatus, AppraisalCycleStatus[]> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['CLOSED'],
  CLOSED: [],
};

// TERMINATED is the only real constraint the backend enforces (terminal —
// no further status changes once set); ACTIVE/ON_LEAVE are freely
// interchangeable otherwise.
export const EMPLOYMENT_STATUS_TRANSITIONS: Record<EmploymentStatus, EmploymentStatus[]> = {
  ACTIVE: ['ON_LEAVE', 'TERMINATED'],
  ON_LEAVE: ['ACTIVE', 'TERMINATED'],
  TERMINATED: [],
};

export const EMPLOYMENT_STATUS_COLORS: Record<EmploymentStatus, string> = {
  ACTIVE: 'green',
  ON_LEAVE: 'yellow',
  TERMINATED: 'gray',
};

export const APPRAISAL_CYCLE_STATUS_COLORS: Record<AppraisalCycleStatus, string> = {
  DRAFT: 'blue',
  ACTIVE: 'green',
  CLOSED: 'gray',
};

export const APPRAISAL_STATUS_COLORS: Record<AppraisalStatus, string> = {
  PENDING: 'blue',
  IN_PROGRESS: 'yellow',
  COMPLETED: 'green',
};
