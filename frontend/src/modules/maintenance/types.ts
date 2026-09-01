export type WorkOrderType = 'CORRECTIVE' | 'PREVENTIVE';
export type WorkOrderPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type WorkOrderStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface WorkOrder {
  id: string;
  organizationId: string;
  assetId: string;
  title: string;
  description: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  requestedById: string;
  assignedToId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// A work order only moves along these edges — mirrors
// backend/src/modules/maintenance/maintenance.service.ts's ALLOWED_TRANSITIONS.
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const WORK_ORDER_STATUS_COLORS: Record<WorkOrderStatus, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'yellow',
  ON_HOLD: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'gray',
};
