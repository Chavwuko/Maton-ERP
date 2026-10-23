import { apiClient } from './client';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REJECTED';

export interface Session {
  id: string;
  cognitoSub: string;
  email: string;
  roleName: string | null;
  departmentId: string | null;
  status: UserStatus;
  firstName: string;
  lastName: string;
  phone: string | null;
  rejectionReason: string | null;
}

export function getSession() {
  return apiClient.get<Session>('/auth/me');
}

// A newly signed-up user sends their details for an admin to review.
export function requestAccess(data: { firstName: string; lastName: string; phone?: string; departmentId?: string }) {
  return apiClient.post<unknown>('/auth/request-access', data);
}
