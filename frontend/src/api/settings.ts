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

export interface EmailSettings {
  enabled: boolean;
  // 'log' means no mail server is connected: emails are only written to the server log.
  transport: 'log' | 'smtp';
}

export function getEmailSettings() {
  return apiClient.get<EmailSettings>('/settings/email');
}

export function updateEmailSettings(data: { enabled: boolean }) {
  return apiClient.put<EmailSettings>('/settings/email', data);
}

