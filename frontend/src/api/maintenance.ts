import { apiClient } from './client';
import type { WorkOrder, WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../modules/maintenance/types';

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

export function updateWorkOrderStatus(id: string, status: WorkOrderStatus) {
  return apiClient.patch<WorkOrder>(`/work-orders/${id}/status`, { status });
}
