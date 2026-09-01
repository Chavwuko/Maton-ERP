import { apiClient } from './client';
import type {
  Appraisal,
  AppraisalCycle,
  AppraisalCycleStatus,
  AppraisalRelationType,
  AppraisalStatus,
  Employee,
  EmploymentStatus,
} from '../modules/hr/types';

export function listEmployees(filters: { organizationId?: string; employmentStatus?: EmploymentStatus; managerId?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<Employee[]>(`/employees${qs ? `?${qs}` : ''}`);
}

export function getEmployee(id: string) {
  return apiClient.get<Employee>(`/employees/${id}`);
}

export function getMyEmployee() {
  return apiClient.get<Employee>('/employees/me');
}

export function createEmployee(data: {
  organizationId: string;
  userId: string;
  employeeNumber: string;
  jobTitle: string;
  hireDate: string;
  managerId?: string;
}) {
  return apiClient.post<Employee>('/employees', data);
}

export function updateEmploymentStatus(id: string, employmentStatus: EmploymentStatus) {
  return apiClient.patch<Employee>(`/employees/${id}/status`, { employmentStatus });
}

export function listAppraisalCycles(filters: { organizationId?: string; status?: AppraisalCycleStatus } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiClient.get<AppraisalCycle[]>(`/appraisal-cycles${qs ? `?${qs}` : ''}`);
}

export function getAppraisalCycle(id: string) {
  return apiClient.get<AppraisalCycle>(`/appraisal-cycles/${id}`);
}

export function createAppraisalCycle(data: { organizationId: string; name: string; startDate: string; endDate: string }) {
  return apiClient.post<AppraisalCycle>('/appraisal-cycles', data);
}

export function updateAppraisalCycleStatus(id: string, status: AppraisalCycleStatus) {
  return apiClient.patch<AppraisalCycle>(`/appraisal-cycles/${id}/status`, { status });
}

export function createAppraisal(
  cycleId: string,
  data: { employeeId: string; reviewers: { employeeId: string; relationType: AppraisalRelationType }[] },
) {
  return apiClient.post<Appraisal>(`/appraisal-cycles/${cycleId}/appraisals`, data);
}

export function listAppraisals(
  filters: { organizationId?: string; cycleId?: string; employeeId?: string; status?: AppraisalStatus } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<Appraisal[]>(`/appraisals${qs ? `?${qs}` : ''}`);
}

export function getAppraisal(id: string) {
  return apiClient.get<Appraisal>(`/appraisals/${id}`);
}

export function submitAppraisalReview(id: string, data: { rating: number; comments?: string }) {
  return apiClient.post<Appraisal>(`/appraisals/${id}/reviews`, data);
}
