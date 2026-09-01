import { apiClient } from './client';
import type { Asset, AssetStatus } from '../modules/assets/types';

export function listAssets(filters: { organizationId?: string; status?: AssetStatus; projectId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  if (filters.status) params.set('status', filters.status);
  if (filters.projectId) params.set('projectId', filters.projectId);
  const qs = params.toString();
  return apiClient.get<Asset[]>(`/assets${qs ? `?${qs}` : ''}`);
}

export function getAsset(id: string) {
  return apiClient.get<Asset>(`/assets/${id}`);
}

export function createAsset(data: {
  organizationId: string;
  assetTag: string;
  name: string;
  category: string;
  projectId?: string;
  location?: string;
}) {
  return apiClient.post<Asset>('/assets', data);
}
