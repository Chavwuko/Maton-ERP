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
  // Set on a preventive work order a maintenance schedule opened.
  scheduleId?: string | null;
  // Recorded when it is completed. Decimal columns arrive as strings.
  completionNotes?: string | null;
  cost?: string | null;
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

export type ScheduleIntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
export type ScheduleBasis = 'FIXED' | 'FLOATING';
export type DueStatus = 'PAUSED' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// A recurring job on one asset. Calendar dates arrive as midnight UTC.
export interface MaintenanceSchedule {
  id: string;
  organizationId: string;
  assetId: string;
  title: string;
  description: string | null;
  intervalValue: number;
  intervalUnit: ScheduleIntervalUnit;
  basis: ScheduleBasis;
  priority: WorkOrderPriority;
  assignedToId: string | null;
  leadDays: number;
  nextDueDate: string;
  lastCompletedDate: string | null;
  active: boolean;
  createdById: string;
  dueStatus: DueStatus;
  asset: { id: string; assetTag: string; name: string; status: string };
  assignedTo: Person | null;
}

export const DUE_STATUS_COLORS: Record<DueStatus, string> = {
  OVERDUE: 'red',
  DUE_SOON: 'yellow',
  UPCOMING: 'blue',
  PAUSED: 'gray',
};

export const INTERVAL_UNITS: { value: ScheduleIntervalUnit; label: string }[] = [
  { value: 'DAYS', label: 'Days' },
  { value: 'WEEKS', label: 'Weeks' },
  { value: 'MONTHS', label: 'Months' },
  { value: 'YEARS', label: 'Years' },
];

export const SCHEDULE_BASES: { value: ScheduleBasis; label: string; description: string }[] = [
  { value: 'FIXED', label: 'Fixed calendar', description: 'Stays on its dates even when a job is done late.' },
  { value: 'FLOATING', label: 'After each job', description: 'Counts the interval from the day the job is finished.' },
];

// "Every 3 months", "Every month".
export function intervalLabel(value: number, unit: ScheduleIntervalUnit): string {
  const singular = unit.slice(0, -1).toLowerCase();
  return value === 1 ? `Every ${singular}` : `Every ${value} ${singular}s`;
}

// What an asset's completed work orders add up to, with the parts used.
export interface ServiceHistory {
  workOrders: (WorkOrder & {
    assignedTo: Person | null;
    stockTransactions: { id: string; quantity: number; item: { id: string; sku: string; name: string; unitOfMeasure: string } }[];
  })[];
  totals: { count: number; preventive: number; cost: string; lastServiceAt: string | null };
}
