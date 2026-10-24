import { apiClient } from './client';
import type { ActivityEntry } from '../modules/users/activityTypes';

export function listActivity(
  filters: { entityType?: string; userId?: string; action?: string; from?: string; to?: string; limit?: number } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return apiClient.get<ActivityEntry[]>(`/activity${qs ? `?${qs}` : ''}`);
}
