import { apiClient } from './client';

export interface AccessSettings {
  openSignup: boolean;
  allowedEmailDomains: string[];
}

export function getAccessSettings() {
  return apiClient.get<AccessSettings>('/settings/access');
}

export function updateAccessSettings(data: Partial<AccessSettings>) {
  return apiClient.put<AccessSettings>('/settings/access', data);
}
