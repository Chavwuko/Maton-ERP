import { apiClient } from './client';
import type { LeaveAccess, LeaveBalance, LeaveRequest, LeaveStatus, LeaveType, OnLeaveDashboard } from '../modules/leave/types';

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export function getLeaveAccess() {
  return apiClient.get<LeaveAccess>('/leave/access');
}

export function listLeaveTypes(filters: { organizationId?: string; all?: boolean } = {}) {
  return apiClient.get<LeaveType[]>(`/leave/types${query({ organizationId: filters.organizationId, all: filters.all ? 'true' : undefined })}`);
}

export function createLeaveType(data: { organizationId: string; name: string; daysPerYear?: number | null; paid?: boolean; allowBackdate?: boolean }) {
  return apiClient.post<LeaveType>('/leave/types', data);
}

export function updateLeaveType(id: string, data: { name?: string; daysPerYear?: number | null; paid?: boolean; allowBackdate?: boolean; active?: boolean }) {
  return apiClient.patch<LeaveType>(`/leave/types/${id}`, data);
}

export function createDefaultLeaveTypes(organizationId: string) {
  return apiClient.post<LeaveType[]>('/leave/types/defaults', { organizationId });
}

export function getLeaveBalance(filters: { employeeId?: string; year?: string } = {}) {
  return apiClient.get<{ employeeId: string; year: number; balances: LeaveBalance[] }>(`/leave/balance${query(filters)}`);
}

export function fileLeave(data: { leaveTypeId: string; startDate: string; endDate: string; reason?: string }) {
  return apiClient.post<LeaveRequest>('/leave/requests', data);
}

export function listMyLeave(status?: LeaveStatus) {
  return apiClient.get<LeaveRequest[]>(`/leave/requests/mine${query({ status })}`);
}

export function listLeaveInbox() {
  return apiClient.get<LeaveRequest[]>('/leave/requests/inbox');
}

export function listAllLeave(filters: { status?: LeaveStatus; departmentId?: string; from?: string; to?: string } = {}) {
  return apiClient.get<LeaveRequest[]>(`/leave/requests${query(filters)}`);
}

export function decideLeave(id: string, decision: 'APPROVE' | 'REJECT', comment?: string) {
  return apiClient.post<LeaveRequest>(`/leave/requests/${id}/decision`, { decision, comment });
}

export function cancelLeave(id: string) {
  return apiClient.post<LeaveRequest>(`/leave/requests/${id}/cancel`, {});
}

export function getOnLeave(filters: { date?: string; departmentId?: string } = {}) {
  return apiClient.get<OnLeaveDashboard>(`/leave/on-leave${query(filters)}`);
}
