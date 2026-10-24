import { apiClient } from './client';
import type {
  Appointment,
  AppointmentSchedule,
  AppointmentStatus,
  Slot,
} from '../modules/appointments/types';

function query(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function getAppointmentSchedule() {
  return apiClient.get<AppointmentSchedule>('/appointments/schedule');
}

export function updateAppointmentSchedule(data: Partial<AppointmentSchedule>) {
  return apiClient.put<AppointmentSchedule>('/appointments/schedule', data);
}

export function getSlots(date: string) {
  return apiClient.get<{ working: boolean; slots: Slot[] }>(`/appointments/slots?date=${encodeURIComponent(date)}`);
}

export function bookAppointment(data: {
  date: string;
  time: string;
  type?: string;
  subject: string;
  details?: string;
  items?: { itemId: string; quantity: number }[];
}) {
  return apiClient.post<Appointment>('/appointments', data);
}

export function listMyAppointments() {
  return apiClient.get<Appointment[]>('/appointments/mine');
}

export function listAppointments(filters: { status?: AppointmentStatus; from?: string; to?: string } = {}) {
  return apiClient.get<Appointment[]>(`/appointments${query(filters)}`);
}

export function cancelAppointment(id: string) {
  return apiClient.post<Appointment>(`/appointments/${id}/cancel`, {});
}

export function reviewAppointment(
  id: string,
  data: {
    decision: 'APPROVED' | 'DECLINED' | 'COMPLETED';
    feedback?: string;
    warehouseId?: string;
    projectId?: string;
    issue?: { itemId: string; quantity: number }[];
  },
) {
  return apiClient.post<Appointment>(`/appointments/${id}/review`, data);
}
