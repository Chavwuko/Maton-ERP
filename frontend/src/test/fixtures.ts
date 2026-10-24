import type { Session } from '../api/auth';
import type { Appointment } from '../modules/appointments/types';
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

export function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    requesterId: 'user-1',
    departmentId: 'dept-1',
    date: '2026-10-26T00:00:00.000Z',
    time: '09:00',
    type: 'Item collection / issue',
    subject: 'Gloves for new hires',
    details: null,
    status: 'PENDING',
    feedback: null,
    feedbackAt: null,
    issuedNote: null,
    createdAt: '2026-10-22T09:00:00.000Z',
    requester: { id: 'user-1', firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' },
    feedbackBy: null,
    department: { id: 'dept-1', name: 'Workshop' },
    items: [
      {
        id: 'line-1',
        appointmentId: 'appt-1',
        itemId: 'item-1',
        quantity: 10,
        item: { id: 'item-1', sku: 'GLV-1', name: 'Work gloves', unitOfMeasure: 'pcs' },
      },
    ],
    ...overrides,
  };
}
