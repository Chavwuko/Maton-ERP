import type { WorkOrder } from '../maintenance/types';

export type AssetStatus = 'ACTIVE' | 'UNDER_MAINTENANCE' | 'DECOMMISSIONED';

export interface Asset {
  id: string;
  organizationId: string;
  projectId: string | null;
  assetTag: string;
  name: string;
  category: string;
  status: AssetStatus;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  workOrders?: WorkOrder[];
}

// Status only ever changes as a side effect of a Maintenance work order's
// status transition (see maintenance.service.ts's syncAssetStatus) — there
// is no direct "change asset status" endpoint, so no transitions map here.
export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  ACTIVE: 'green',
  UNDER_MAINTENANCE: 'yellow',
  DECOMMISSIONED: 'gray',
};
