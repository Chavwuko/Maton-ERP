import { addDays, addInterval, dayString, dueStatus } from './schedule-dates';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('schedule dates', () => {
  describe('addInterval', () => {
    it('adds days and weeks', () => {
      expect(dayString(addInterval(d('2026-10-30'), 5, 'DAYS'))).toBe('2026-11-04');
      expect(dayString(addInterval(d('2026-10-30'), 2, 'WEEKS'))).toBe('2026-11-13');
    });

    it('adds months on the same day of the month', () => {
      expect(dayString(addInterval(d('2026-01-15'), 3, 'MONTHS'))).toBe('2026-04-15');
      expect(dayString(addInterval(d('2026-11-15'), 3, 'MONTHS'))).toBe('2027-02-15');
    });

    it('clamps to the end of a shorter month instead of spilling into the next', () => {
      expect(dayString(addInterval(d('2026-01-31'), 1, 'MONTHS'))).toBe('2026-02-28');
      expect(dayString(addInterval(d('2028-01-31'), 1, 'MONTHS'))).toBe('2028-02-29');
      expect(dayString(addInterval(d('2026-03-31'), 1, 'MONTHS'))).toBe('2026-04-30');
    });

    it('adds years, including from a leap day', () => {
      expect(dayString(addInterval(d('2026-06-10'), 2, 'YEARS'))).toBe('2028-06-10');
      expect(dayString(addInterval(d('2028-02-29'), 1, 'YEARS'))).toBe('2029-02-28');
    });

    it('does not change the date it was given', () => {
      const start = d('2026-10-30');

      addInterval(start, 1, 'MONTHS');

      expect(dayString(start)).toBe('2026-10-30');
    });
  });

  it('addDays moves by whole days, backwards too', () => {
    expect(dayString(addDays(d('2026-03-01'), -1))).toBe('2026-02-28');
  });

  describe('dueStatus', () => {
    const schedule = (overrides = {}) => ({ active: true, nextDueDate: d('2026-10-30'), leadDays: 7, ...overrides });

    it('is paused whatever the date when the schedule is switched off', () => {
      expect(dueStatus(schedule({ active: false, nextDueDate: d('2020-01-01') }), '2026-10-27')).toBe('PAUSED');
    });

    it('is overdue only once the due date has passed', () => {
      expect(dueStatus(schedule(), '2026-10-31')).toBe('OVERDUE');
      expect(dueStatus(schedule(), '2026-10-30')).toBe('DUE_SOON');
    });

    it('is due soon from the lead time up to and including the day', () => {
      expect(dueStatus(schedule(), '2026-10-23')).toBe('DUE_SOON');
      expect(dueStatus(schedule(), '2026-10-29')).toBe('DUE_SOON');
    });

    it('is upcoming before the lead time starts', () => {
      expect(dueStatus(schedule(), '2026-10-22')).toBe('UPCOMING');
    });

    it('with no lead time is due soon only on the day itself', () => {
      expect(dueStatus(schedule({ leadDays: 0 }), '2026-10-29')).toBe('UPCOMING');
      expect(dueStatus(schedule({ leadDays: 0 }), '2026-10-30')).toBe('DUE_SOON');
    });
  });
});
