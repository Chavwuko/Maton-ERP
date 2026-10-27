import type { Session } from '../api/auth';
import type { Appointment } from '../modules/appointments/types';
import type { Asset, AssetAssignment } from '../modules/assets/types';
import type { MaintenanceSchedule, ServiceHistory } from '../modules/maintenance/types';
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

export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    organizationId: 'org-1',
    projectId: null,
    assetTag: 'PUMP-001',
    name: 'Feed Pump A',
    category: 'Rotating',
    status: 'ACTIVE',
    location: 'Bay 3',
    serialNumber: 'SN-100',
    make: 'Grundfos',
    model: 'CR-45',
    purchaseDate: '2026-01-15T00:00:00.000Z',
    purchaseCost: '1500.50',
    vendorId: 'ven-1',
    warrantyExpiry: '2028-01-15T00:00:00.000Z',
    condition: 'GOOD',
    notes: null,
    departmentId: 'dept-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    vendor: { id: 'ven-1', name: 'Apex Supplies' },
    department: { id: 'dept-1', name: 'Plant' },
    currentAssignment: null,
    workOrders: [],
    ...overrides,
  };
}

export function makeAssignment(overrides: Partial<AssetAssignment> = {}): AssetAssignment {
  return {
    id: 'asg-1',
    assetId: 'asset-1',
    assigneeId: 'u-ann',
    departmentId: null,
    assignedAt: '2026-10-20T09:00:00.000Z',
    expectedReturn: '2026-12-01T00:00:00.000Z',
    returnedAt: null,
    conditionOut: 'GOOD',
    conditionIn: null,
    notes: null,
    returnNotes: null,
    assignee: { id: 'u-ann', firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' },
    department: null,
    ...overrides,
  };
}

export function makeSchedule(overrides: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule {
  return {
    id: 'sch-1',
    organizationId: 'org-1',
    assetId: 'asset-1',
    title: 'Grease bearings',
    description: null,
    intervalValue: 3,
    intervalUnit: 'MONTHS',
    basis: 'FIXED',
    priority: 'MEDIUM',
    assignedToId: null,
    leadDays: 7,
    nextDueDate: '2026-11-15T00:00:00.000Z',
    lastCompletedDate: '2026-08-15T00:00:00.000Z',
    active: true,
    createdById: 'user-1',
    dueStatus: 'UPCOMING',
    asset: { id: 'asset-1', assetTag: 'PUMP-001', name: 'Feed Pump A', status: 'ACTIVE' },
    assignedTo: null,
    ...overrides,
  };
}

export function makeServiceHistory(overrides: Partial<ServiceHistory> = {}): ServiceHistory {
  return { workOrders: [], totals: { count: 0, preventive: 0, cost: '0.00', lastServiceAt: null }, ...overrides };
}
