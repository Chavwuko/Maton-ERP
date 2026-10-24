import { BadRequestException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import {
  applyScheduleChanges,
  DEFAULT_SCHEDULE,
  dayOfWeek,
  getSchedule,
  isValidDateString,
  minutesToTime,
  nowIn,
  saveSchedule,
  timeToMinutes,
} from './appointment-schedule';

describe('appointment schedule', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe('getSchedule / saveSchedule', () => {
    it('falls back to the defaults when nothing is stored', async () => {
      prisma.appSetting.findMany.mockResolvedValue([]);

      await expect(getSchedule(prisma)).resolves.toEqual(DEFAULT_SCHEDULE);
    });

    it('reads stored values', async () => {
      prisma.appSetting.findMany.mockResolvedValue([
        { key: 'appointments.workStart', value: '09:00' },
        { key: 'appointments.workEnd', value: '15:00' },
        { key: 'appointments.slotMinutes', value: '20' },
        { key: 'appointments.slotCapacity', value: '3' },
        { key: 'appointments.workingDays', value: '1,3,5' },
        { key: 'appointments.timeZone', value: 'Europe/London' },
      ] as never);

      await expect(getSchedule(prisma)).resolves.toEqual({
        workStart: '09:00',
        workEnd: '15:00',
        slotMinutes: 20,
        slotCapacity: 3,
        workingDays: [1, 3, 5],
        timeZone: 'Europe/London',
      });
    });

    it('saves every field as its own setting', async () => {
      await saveSchedule(prisma, { ...DEFAULT_SCHEDULE, workingDays: [2, 4] });

      expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(6);
      expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'appointments.workingDays' },
        update: { value: '2,4' },
        create: { key: 'appointments.workingDays', value: '2,4' },
      });
    });
  });

  describe('time helpers', () => {
    it('converts between HH:MM and minutes', () => {
      expect(timeToMinutes('08:30')).toBe(510);
      expect(minutesToTime(510)).toBe('08:30');
      expect(minutesToTime(0)).toBe('00:00');
    });

    it('rejects malformed or impossible times', () => {
      expect(timeToMinutes('8:30')).toBeNaN();
      expect(timeToMinutes('25:00')).toBeNaN();
      expect(timeToMinutes('10:61')).toBeNaN();
      expect(timeToMinutes('')).toBeNaN();
    });

    it('validates calendar dates, not just the pattern', () => {
      expect(isValidDateString('2026-10-24')).toBe(true);
      expect(isValidDateString('2026-02-30')).toBe(false);
      expect(isValidDateString('24/10/2026')).toBe(false);
      expect(isValidDateString('2026-13-01')).toBe(false);
    });

    it('finds the weekday of a date', () => {
      expect(dayOfWeek('2026-10-24')).toBe(6); // Saturday
      expect(dayOfWeek('2026-10-26')).toBe(1); // Monday
    });

    it('reads the wall clock in the given zone, including across midnight', () => {
      const instant = new Date('2026-10-24T23:30:00.000Z');

      expect(nowIn('UTC', instant)).toEqual({ date: '2026-10-24', minutes: 23 * 60 + 30 });
      expect(nowIn('Africa/Lagos', instant)).toEqual({ date: '2026-10-25', minutes: 30 });
    });

    it('defaults to the current time', () => {
      const result = nowIn('UTC');

      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.minutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyScheduleChanges', () => {
    it('keeps the current schedule when nothing changes', () => {
      expect(applyScheduleChanges({}, DEFAULT_SCHEDULE)).toEqual(DEFAULT_SCHEDULE);
    });

    it('applies valid edits, de-duplicating and ordering the working days', () => {
      const next = applyScheduleChanges(
        {
          workStart: ' 09:00 ',
          workEnd: '13:00',
          slotMinutes: '20',
          slotCapacity: 2,
          workingDays: [5, 1, 5, 3],
          timeZone: ' Europe/London ',
        },
        DEFAULT_SCHEDULE,
      );

      expect(next).toEqual({
        workStart: '09:00',
        workEnd: '13:00',
        slotMinutes: 20,
        slotCapacity: 2,
        workingDays: [1, 3, 5],
        timeZone: 'Europe/London',
      });
    });

    it.each([
      [{ workStart: '9am' }, /look like 08:00/],
      [{ workEnd: '25:00' }, /look like 08:00/],
      [{ workStart: '17:00', workEnd: '08:00' }, /Closing time must be after/],
      [{ slotMinutes: 5 }, /Slot length/],
      [{ slotMinutes: 12 }, /Slot length/],
      [{ slotMinutes: 300 }, /Slot length/],
      [{ slotMinutes: 'x' }, /Slot length/],
      [{ workStart: '08:00', workEnd: '08:20', slotMinutes: 30 }, /shorter than one slot/],
      [{ slotCapacity: 0 }, /whole number from 1 to 50/],
      [{ slotCapacity: 51 }, /whole number from 1 to 50/],
      [{ slotCapacity: 1.5 }, /whole number from 1 to 50/],
      [{ workingDays: [] }, /at least one working day/],
      [{ workingDays: [7] }, /at least one working day/],
      [{ workingDays: [1.5] }, /at least one working day/],
      [{ workingDays: 'mon' }, /at least one working day/],
      [{ timeZone: 'Mars/Olympus' }, /not a valid time zone/],
    ])('rejects %j', (changes, message) => {
      expect(() => applyScheduleChanges(changes as never, DEFAULT_SCHEDULE)).toThrow(BadRequestException);
      expect(() => applyScheduleChanges(changes as never, DEFAULT_SCHEDULE)).toThrow(message);
    });
  });
});
