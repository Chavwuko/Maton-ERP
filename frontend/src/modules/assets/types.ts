import type { WorkOrder } from '../maintenance/types';

export type AssetStatus = 'ACTIVE' | 'UNDER_MAINTENANCE' | 'DECOMMISSIONED';
export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// Who holds an asset, and since when. An asset has at most one open one.
export interface AssetAssignment {
  id: string;
  assetId: string;
  assigneeId: string | null;
  departmentId: string | null;
  assignedAt: string;
  expectedReturn: string | null;
  returnedAt: string | null;
  conditionOut: AssetCondition;
  conditionIn: AssetCondition | null;
  notes: string | null;
  returnNotes: string | null;
  assignee: Person | null;
  department: { id: string; name: string } | null;
  // Only on the custody history.
  assignedBy?: Person;
  returnedBy?: Person | null;
}

export interface Asset {
  id: string;
  organizationId: string;
  projectId: string | null;
  assetTag: string;
  name: string;
  category: string;
  status: AssetStatus;
  location: string | null;
  serialNumber: string | null;
  make: string | null;
  model: string | null;
  // Calendar dates arrive as midnight UTC; use assetDate() to read them.
  purchaseDate: string | null;
  // Decimal columns arrive as strings. Hidden from the staff role.
  purchaseCost?: string | null;
  vendorId: string | null;
  warrantyExpiry: string | null;
  condition: AssetCondition;
  notes: string | null;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
  vendor?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  currentAssignment: AssetAssignment | null;
  workOrders?: WorkOrder[];
}

// Asset status only moves by hand between ACTIVE and DECOMMISSIONED;
// UNDER_MAINTENANCE follows the Maintenance work orders (see
// maintenance.service.ts's syncAssetStatus).
export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  ACTIVE: 'green',
  UNDER_MAINTENANCE: 'yellow',
  DECOMMISSIONED: 'gray',
};

export const ASSET_CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

export const ASSET_CONDITION_COLORS: Record<AssetCondition, string> = {
  NEW: 'teal',
  GOOD: 'green',
  FAIR: 'yellow',
  POOR: 'red',
};

// "2026-10-26T00:00:00.000Z" is the calendar day 26 October whatever the
// viewer's zone, so read the date part rather than converting the instant.
export function assetDate(date: string | null): string {
  return date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—';
}

export function holderName(assignment: AssetAssignment | null): string {
  if (!assignment) return '—';
  if (assignment.assignee) {
    return `${assignment.assignee.firstName} ${assignment.assignee.lastName}`.trim() || assignment.assignee.email;
  }
  return assignment.department?.name ?? '—';
}
