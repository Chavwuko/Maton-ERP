import { apiClient } from './client';

export interface Session {
  id: string;
  cognitoSub: string;
  email: string;
  roleName: string | null;
  departmentId: string | null;
}

export function getSession() {
  return apiClient.get<Session>('/auth/me');
}
