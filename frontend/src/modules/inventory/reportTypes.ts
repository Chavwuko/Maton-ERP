import type { Appointment } from '../appointments/types';
import type { StockStatus } from './types';

export interface RankedValue {
  name: string;
  value: number;
}

export interface StockAlert {
  id: string;
  sku: string;
  name: string;
  unit: string;
  onHand: number;
  reorderPoint: number | null;
  status: StockStatus;
}

export interface RecentMovement {
  id: string;
  type: string;
  quantity: number;
  createdAt: string;
  item: { sku: string; name: string; unitOfMeasure: string };
  warehouse: { code: string };
}

// What the store team sees on the Inventory dashboard.
export interface ManagementDashboard {
  kind: 'management';
  kpi: { items: number; stockValue: number; low: number; out: number; purchasesMonth: number; consumptionMonth: number };
  actions: { pendingAppointments: number; todayAppointments: number; accessRequests: number };
  monthly: { labels: string[]; purchases: number[]; consumption: number[] };
  byCategory: RankedValue[];
  topConsumed: RankedValue[];
  byDepartment: RankedValue[];
  alerts: StockAlert[];
  upcoming: Appointment[];
  recent: RecentMovement[];
}

// What everyone else sees: their own appointments.
export interface MyDashboard {
  kind: 'mine';
  name: string;
  counts: { pending: number; approved: number; completed: number; declined: number };
  upcoming: Appointment[];
  feedback: Appointment[];
}

export type InventoryDashboard = ManagementDashboard | MyDashboard;

export interface Totals {
  name: string;
  total: number;
  count: number;
}

export interface InventoryReport {
  totals: {
    purchases: number;
    consumption: number;
    purchaseLines: number;
    issueLines: number;
    appointments: number;
    appointmentsCompleted: number;
    appointmentsPending: number;
  };
  bySupplier: Totals[];
  byProject: Totals[];
  byDepartment: Totals[];
  byItem: { sku: string; name: string; unit: string; quantity: number; value: number }[];
  valuation: { name: string; items: number; value: number }[];
}
