import { apiClient } from './client';
import type { ActivityEntry } from '../modules/users/activityTypes';
import type { ServiceHistory } from '../modules/maintenance/types';
import type { Asset, AssetAssignment, AssetCondition, AssetDashboard, AssetStatus, AssetValuation, DepreciationMethod, ValuationReport } from '../modules/assets/types';

export interface AssetFields {
  location?: string | null;
  projectId?: string | null;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  vendorId?: string | null;
  warrantyExpiry?: string | null;
  condition?: AssetCondition;
  notes?: string | null;
  departmentId?: string | null;
  depreciationMethod?: DepreciationMethod;
  usefulLifeMonths?: number | null;
  salvageValue?: number | null;
  depreciationStartDate?: string | null;
}

export interface AssetFilters {
  organizationId?: string;
  status?: AssetStatus;
  projectId?: string;
  departmentId?: string;
  condition?: AssetCondition;
  assignedToId?: string;
  search?: string;
}

export function listAssets(filters: AssetFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<Asset[]>(`/assets${qs ? `?${qs}` : ''}`);
}

// What the signed-in person is holding.
export function listMyAssets() {
  return apiClient.get<Asset[]>('/assets/mine');
}

export function getAsset(id: string) {
  return apiClient.get<Asset>(`/assets/${id}`);
}

export function createAsset(data: AssetFields & { organizationId: string; assetTag: string; name: string; category: string }) {
  return apiClient.post<Asset>('/assets', data);
}

export function updateAsset(
  id: string,
  data: AssetFields & { assetTag?: string; name?: string; category?: string; status?: 'ACTIVE' | 'DECOMMISSIONED' },
) {
  return apiClient.patch<Asset>(`/assets/${id}`, data);
}

export function checkOutAsset(
  id: string,
  data: { assigneeId?: string; departmentId?: string; expectedReturn?: string; condition?: AssetCondition; notes?: string },
) {
  return apiClient.post<Asset>(`/assets/${id}/check-out`, data);
}

export function checkInAsset(id: string, data: { condition?: AssetCondition; notes?: string }) {
  return apiClient.post<Asset>(`/assets/${id}/check-in`, data);
}

export function listAssetAssignments(id: string) {
  return apiClient.get<AssetAssignment[]>(`/assets/${id}/assignments`);
}

export function getAssetHistory(id: string) {
  return apiClient.get<ActivityEntry[]>(`/assets/${id}/history`);
}

export function getAssetServiceHistory(id: string) {
  return apiClient.get<ServiceHistory>(`/assets/${id}/service-history`);
}

export function getAssetValuation(id: string, asOf?: string) {
  return apiClient.get<AssetValuation>(`/assets/${id}/valuation${asOf ? `?asOf=${asOf}` : ''}`);
}

export function getValuationReport(filters: { organizationId?: string; asOf?: string; includeDecommissioned?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  if (filters.asOf) params.set('asOf', filters.asOf);
  if (filters.includeDecommissioned) params.set('includeDecommissioned', 'true');
  const qs = params.toString();
  return apiClient.get<ValuationReport>(`/assets/valuation${qs ? `?${qs}` : ''}`);
}

export function getAssetDashboard(organizationId?: string) {
  return apiClient.get<AssetDashboard>(`/assets/dashboard${organizationId ? `?organizationId=${organizationId}` : ''}`);
}

// The register as a spreadsheet, filtered like the list.
export function downloadAssetExport(filters: { search?: string; status?: AssetStatus; condition?: AssetCondition } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.download(`/assets/export${qs ? `?${qs}` : ''}`);
}

export function downloadValuationExport(filters: { organizationId?: string; asOf?: string; includeDecommissioned?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  if (filters.asOf) params.set('asOf', filters.asOf);
  if (filters.includeDecommissioned) params.set('includeDecommissioned', 'true');
  const qs = params.toString();
  return apiClient.download(`/assets/valuation/export${qs ? `?${qs}` : ''}`);
}
