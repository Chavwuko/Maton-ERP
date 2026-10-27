import { apiClient } from './client';
import type { ActivityEntry } from '../modules/users/activityTypes';
import type { ServiceHistory } from '../modules/maintenance/types';
import type { Asset, AssetAssignment, AssetCondition, AssetStatus } from '../modules/assets/types';

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
