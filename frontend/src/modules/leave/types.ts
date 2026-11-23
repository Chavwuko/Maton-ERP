export type LeaveStatus = 'PENDING_SUPERVISOR' | 'PENDING_HR' | 'PENDING_DIRECTOR' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveStage = 'SUPERVISOR' | 'HR' | 'DIRECTOR';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface LeaveType {
  id: string;
  organizationId: string;
  name: string;
  daysPerYear: number | null;
  paid: boolean;
  allowBackdate: boolean;
  active: boolean;
}

export interface LeaveApproval {
  id: string;
  stage: LeaveStage;
  decision: 'APPROVED' | 'REJECTED';
  comment: string | null;
  decidedAt: string;
  decider: Person;
}

// Calendar dates arrive as midnight UTC: read them with leaveDate().
export interface LeaveRequest {
  id: string;
  employeeId: string;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  returnDate: string;
  days: number;
  reason: string | null;
  createdAt: string;
  leaveType: { id: string; name: string; paid: boolean };
  employee: {
    id: string;
    employeeNumber: string;
    jobTitle: string;
    user: { id: string; firstName: string; lastName: string; email: string; department: { id: string; name: string } | null };
  };
  approvals: LeaveApproval[];
}

export interface LeaveAccess {
  employeeId: string | null;
  organizationId: string | null;
  isDepartmentHead: boolean;
  isSupervisor: boolean;
  canViewDashboard: boolean;
  canViewAll: boolean;
  canManageTypes: boolean;
  awaitingMyDecision: number;
}

export interface LeaveBalance {
  leaveTypeId: string;
  name: string;
  paid: boolean;
  entitlement: number | null;
  used: number;
  pending: number;
  remaining: number | null;
}

export interface OnLeaveDashboard {
  asOf: string;
  onLeave: LeaveRequest[];
  upcoming: LeaveRequest[];
  counts: { onLeave: number; returningThisWeek: number; startingSoon: number; awaitingApproval: number };
}

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING_SUPERVISOR: 'With supervisor',
  PENDING_HR: 'With HR',
  PENDING_DIRECTOR: 'With executive director',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  CANCELLED: 'Cancelled',
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
  PENDING_SUPERVISOR: 'yellow',
  PENDING_HR: 'yellow',
  PENDING_DIRECTOR: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
};

export const LEAVE_STAGES: { stage: LeaveStage; label: string; pending: LeaveStatus }[] = [
  { stage: 'SUPERVISOR', label: 'Supervisor', pending: 'PENDING_SUPERVISOR' },
  { stage: 'HR', label: 'HR', pending: 'PENDING_HR' },
  { stage: 'DIRECTOR', label: 'Executive director', pending: 'PENDING_DIRECTOR' },
];

// "2026-12-01T00:00:00.000Z" is the calendar day 1 December whatever the
// viewer's zone, so read the date part rather than converting the instant.
export function leaveDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function personName(person: { firstName: string; lastName: string; email: string }): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}

// Whole days from `from` to `to`, both calendar days.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}
