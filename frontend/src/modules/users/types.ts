export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REJECTED';

export interface Role {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  status: UserStatus;
  role: Role | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  requestedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export const USER_STATUS_COLORS: Record<UserStatus, string> = {
  ACTIVE: 'green',
  PENDING: 'yellow',
  DISABLED: 'gray',
  REJECTED: 'red',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  DISABLED: 'Disabled',
  REJECTED: 'Rejected',
};
