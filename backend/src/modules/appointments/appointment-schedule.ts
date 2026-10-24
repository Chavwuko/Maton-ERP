import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service';

// When the store takes appointments. Stored as AppSetting rows so an admin
// can change it without a deploy.
export interface AppointmentSchedule {
  workStart: string; // "HH:MM"
  workEnd: string; // "HH:MM"
  slotMinutes: number;
  slotCapacity: number; // appointments the store can take at the same time
  workingDays: number[]; // 0 = Sunday ... 6 = Saturday
  // IANA zone the times and "is this in the past" are judged in. The server
  // may run in UTC, but the store opens at 08:00 where it is.
  timeZone: string;
}

export const DEFAULT_SCHEDULE: AppointmentSchedule = {
  workStart: '08:00',
  workEnd: '17:00',
  slotMinutes: 30,
  slotCapacity: 1,
  workingDays: [1, 2, 3, 4, 5],
  timeZone: 'Africa/Lagos',
};

const KEY = {
  workStart: 'appointments.workStart',
  workEnd: 'appointments.workEnd',
  slotMinutes: 'appointments.slotMinutes',
  slotCapacity: 'appointments.slotCapacity',
  workingDays: 'appointments.workingDays',
  timeZone: 'appointments.timeZone',
} as const;

type SettingsDb = Pick<PrismaService, 'appSetting'>;

export async function getSchedule(db: SettingsDb): Promise<AppointmentSchedule> {
  const rows = await db.appSetting.findMany({ where: { key: { in: Object.values(KEY) } } });
  const get = new Map(rows.map((row) => [row.key, row.value]));
  const d = DEFAULT_SCHEDULE;

  return {
    workStart: get.get(KEY.workStart) ?? d.workStart,
    workEnd: get.get(KEY.workEnd) ?? d.workEnd,
    slotMinutes: Number(get.get(KEY.slotMinutes) ?? d.slotMinutes),
    slotCapacity: Number(get.get(KEY.slotCapacity) ?? d.slotCapacity),
    workingDays: get.has(KEY.workingDays) ? get.get(KEY.workingDays)!.split(',').map(Number) : d.workingDays,
    timeZone: get.get(KEY.timeZone) ?? d.timeZone,
  };
}

export async function saveSchedule(db: SettingsDb, schedule: AppointmentSchedule): Promise<void> {
  const entries: [string, string][] = [
    [KEY.workStart, schedule.workStart],
    [KEY.workEnd, schedule.workEnd],
    [KEY.slotMinutes, String(schedule.slotMinutes)],
    [KEY.slotCapacity, String(schedule.slotCapacity)],
    [KEY.workingDays, schedule.workingDays.join(',')],
    [KEY.timeZone, schedule.timeZone],
  ];
  for (const [key, value] of entries) {
    await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return NaN;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours > 23 || minutes > 59 ? NaN : hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Today's date and the minutes since midnight, as the wall clock reads in the
// schedule's zone.
export function nowIn(timeZone: string, now: Date = new Date()): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Merges an admin's edits over the current schedule and rejects anything the
// booking maths could not work with.
export function applyScheduleChanges(
  changes: Partial<Record<keyof AppointmentSchedule, unknown>>,
  current: AppointmentSchedule,
): AppointmentSchedule {
  const next: AppointmentSchedule = {
    workStart: changes.workStart === undefined ? current.workStart : String(changes.workStart).trim(),
    workEnd: changes.workEnd === undefined ? current.workEnd : String(changes.workEnd).trim(),
    slotMinutes: changes.slotMinutes === undefined ? current.slotMinutes : Number(changes.slotMinutes),
    slotCapacity: changes.slotCapacity === undefined ? current.slotCapacity : Number(changes.slotCapacity),
    workingDays:
      changes.workingDays === undefined
        ? current.workingDays
        : Array.isArray(changes.workingDays)
          ? changes.workingDays.map(Number)
          : [],
    timeZone: changes.timeZone === undefined ? current.timeZone : String(changes.timeZone).trim(),
  };

  const start = timeToMinutes(next.workStart);
  const end = timeToMinutes(next.workEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new BadRequestException('Working hours must look like 08:00');
  }
  if (start >= end) {
    throw new BadRequestException('Closing time must be after opening time');
  }
  if (!Number.isInteger(next.slotMinutes) || next.slotMinutes < 10 || next.slotMinutes > 240 || next.slotMinutes % 5 !== 0) {
    throw new BadRequestException('Slot length must be between 10 and 240 minutes, in steps of 5');
  }
  if (end - start < next.slotMinutes) {
    throw new BadRequestException('Working hours are shorter than one slot');
  }
  if (!Number.isInteger(next.slotCapacity) || next.slotCapacity < 1 || next.slotCapacity > 50) {
    throw new BadRequestException('Appointments per slot must be a whole number from 1 to 50');
  }
  if (next.workingDays.length === 0 || next.workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new BadRequestException('Select at least one working day (0 = Sunday to 6 = Saturday)');
  }
  next.workingDays = [...new Set(next.workingDays)].sort((a, b) => a - b);
  if (!isValidTimeZone(next.timeZone)) {
    throw new BadRequestException(`"${next.timeZone}" is not a valid time zone, e.g. Africa/Lagos`);
  }
  return next;
}
