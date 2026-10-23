import type { Session } from '../api/auth';
import type { User } from '../modules/users/types';

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'user-1',
    cognitoSub: 'sub-1',
    email: 'pat@acme.test',
    roleName: null,
    departmentId: null,
    status: 'PENDING',
    firstName: '',
    lastName: '',
    phone: null,
    rejectionReason: null,
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'jane@acme.test',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: null,
    isActive: true,
    status: 'ACTIVE',
    role: { id: 'role-1', name: 'admin' },
    departmentId: null,
    department: null,
    requestedAt: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
