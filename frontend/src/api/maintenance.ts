import { apiClient } from './client';
import type {
  DueStatus,
  MaintenanceSchedule,
  ScheduleBasis,
  ScheduleIntervalUnit,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from '../modules/maintenance/types';

export function listWorkOrders(
  filters: {
    organizationId?: string;
    assetId?: string;
    status?: WorkOrderStatus;
    type?: WorkOrderType;
    priority?: WorkOrderPriority;
  } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<WorkOrder[]>(`/work-orders${qs ? `?${qs}` : ''}`);
}

export function getWorkOrder(id: string) {
  return apiClient.get<WorkOrder>(`/work-orders/${id}`);
}

export function createWorkOrder(data: {
  organizationId: string;
  assetId: string;
  title: string;
  description?: string;
  type?: WorkOrderType;
  priority?: WorkOrderPriority;
  dueDate?: string;
  assignedToId?: string;
}) {
  return apiClient.post<WorkOrder>('/work-orders', data);
}

export function assignWorkOrder(id: string, assignedToId: string) {
  return apiClient.patch<WorkOrder>(`/work-orders/${id}/assign`, { assignedToId });
}

// Notes and cost only go with COMPLETED.
export function updateWorkOrderStatus(id: string, status: WorkOrderStatus, details?: { completionNotes?: string; cost?: number }) {
  return apiClient.patch<WorkOrder>(`/work-orders/${id}/status`, details ? { status, ...details } : { status });
}

export interface ScheduleFields {
  title?: string;
  description?: string | null;
  intervalValue?: number;
  intervalUnit?: ScheduleIntervalUnit;
  basis?: ScheduleBasis;
  priority?: WorkOrderPriority;
  leadDays?: number;
  assignedToId?: string | null;
}

export function listSchedules(filters: { organizationId?: string; assetId?: string; active?: boolean; dueStatus?: DueStatus } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return apiClient.get<MaintenanceSchedule[]>(`/maintenance-schedules${qs ? `?${qs}` : ''}`);
}

export function createSchedule(data: ScheduleFields & { assetId: string; title: string; intervalValue: number; intervalUnit: ScheduleIntervalUnit; firstDueDate: string }) {
  return apiClient.post<MaintenanceSchedule>('/maintenance-schedules', data);
}

export function updateSchedule(id: string, data: ScheduleFields & { nextDueDate?: string; active?: boolean }) {
  return apiClient.patch<MaintenanceSchedule>(`/maintenance-schedules/${id}`, data);
}

export function deleteSchedule(id: string) {
  return apiClient.delete<unknown>(`/maintenance-schedules/${id}`);
}

// Opens the work orders that are due now instead of waiting for the hourly run.
export function generateDueWorkOrders() {
  return apiClient.post<{ created: number; workOrders: { id: string; title: string; assetTag: string }[] }>('/maintenance-schedules/generate', {});
}
