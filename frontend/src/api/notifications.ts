import { apiClient } from './client';

export interface Notifications {
  access: { id: string; name: string; email: string; department: string | null; submitted: boolean; createdAt: string }[];
  appointments: {
    id: string;
    date: string;
    time: string;
    subject: string;
    requesterName: string;
    department: string | null;
  }[];
  counts: { access: number; appointments: number; total: number };
}

export function getNotifications() {
  return apiClient.get<Notifications>('/notifications');
}
