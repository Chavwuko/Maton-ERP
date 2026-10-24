export type AppointmentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED';

export interface AppointmentItem {
  id: string;
  appointmentId: string;
  itemId: string;
  quantity: number;
  item: { id: string; sku: string; name: string; unitOfMeasure: string };
}

export interface Appointment {
  id: string;
  requesterId: string;
  departmentId: string | null;
  // A calendar date arrives as midnight UTC; use appointmentDate() to read it.
  date: string;
  time: string;
  type: string;
  subject: string;
  details: string | null;
  status: AppointmentStatus;
  feedback: string | null;
  feedbackAt: string | null;
  issuedNote: string | null;
  createdAt: string;
  requester: { id: string; firstName: string; lastName: string; email: string };
  feedbackBy: { id: string; firstName: string; lastName: string; email: string } | null;
  department: { id: string; name: string } | null;
  items: AppointmentItem[];
}

export interface Slot {
  time: string;
  booked: number;
  capacity: number;
  available: boolean;
}

export interface AppointmentSchedule {
  workStart: string;
  workEnd: string;
  slotMinutes: number;
  slotCapacity: number;
  workingDays: number[];
  timeZone: string;
}

// Same list the old store offered.
export const APPOINTMENT_TYPES = [
  'Item collection / issue',
  'Equipment return',
  'Site visit',
  'Technical consultation',
  'Meeting with Store',
  'Other',
];

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  PENDING: 'yellow',
  APPROVED: 'blue',
  COMPLETED: 'green',
  DECLINED: 'red',
  CANCELLED: 'gray',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2026-10-26T00:00:00.000Z" is the calendar day 26 October whatever the
// viewer's zone, so read the date part rather than converting the instant.
export function appointmentDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

export function personName(person: { firstName: string; lastName: string; email: string }): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}
