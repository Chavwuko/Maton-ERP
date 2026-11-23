import { isWorkingDay, nextWorkingDay, workingDaysBetween } from './leave-dates';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const weekdays = [1, 2, 3, 4, 5];
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('leave dates', () => {
  it('knows which days are working days', () => {
    expect(isWorkingDay(d('2026-11-23'), weekdays)).toBe(true); // Monday
    expect(isWorkingDay(d('2026-11-28'), weekdays)).toBe(false); // Saturday
    expect(isWorkingDay(d('2026-11-29'), [0])).toBe(true); // a Sunday-only schedule
  });

  describe('workingDaysBetween', () => {
    it('counts both ends and skips the weekend', () => {
      expect(workingDaysBetween(d('2026-11-23'), d('2026-11-27'), weekdays)).toBe(5);
      expect(workingDaysBetween(d('2026-11-23'), d('2026-12-04'), weekdays)).toBe(10);
      expect(workingDaysBetween(d('2026-11-26'), d('2026-11-30'), weekdays)).toBe(3);
    });

    it('is one for a single working day and none for a weekend', () => {
      expect(workingDaysBetween(d('2026-11-25'), d('2026-11-25'), weekdays)).toBe(1);
      expect(workingDaysBetween(d('2026-11-28'), d('2026-11-29'), weekdays)).toBe(0);
    });

    it('follows the store’s own working days', () => {
      expect(workingDaysBetween(d('2026-11-23'), d('2026-11-29'), [0, 6])).toBe(2);
    });
  });

  describe('nextWorkingDay', () => {
    it('is the next day in the middle of the week', () => {
      expect(iso(nextWorkingDay(d('2026-11-24'), weekdays))).toBe('2026-11-25');
    });

    it('jumps the weekend', () => {
      expect(iso(nextWorkingDay(d('2026-11-27'), weekdays))).toBe('2026-11-30');
      expect(iso(nextWorkingDay(d('2026-11-28'), weekdays))).toBe('2026-11-30');
    });

    it('gives up after a week when nothing is a working day', () => {
      expect(iso(nextWorkingDay(d('2026-11-24'), []))).toBe('2026-12-02');
    });
  });
});
