export type IntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
export type DueStatus = 'PAUSED' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING';

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayString = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// Adds whole months, clamping to the end of a shorter month (31 Jan + 1 month
// is 28 or 29 Feb, not 3 March).
function addMonths(date: Date, months: number): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}

// Dates here are calendar days held as midnight UTC.
export function addInterval(date: Date, value: number, unit: IntervalUnit): Date {
  switch (unit) {
    case 'DAYS':
      return addDays(date, value);
    case 'WEEKS':
      return addDays(date, value * 7);
    case 'MONTHS':
      return addMonths(date, value);
    case 'YEARS':
      return addMonths(date, value * 12);
  }
}

// Where a schedule stands today. `today` is a YYYY-MM-DD string in the
// store's time zone.
export function dueStatus(schedule: { active: boolean; nextDueDate: Date; leadDays: number }, today: string): DueStatus {
  if (!schedule.active) return 'PAUSED';
  const due = dayString(schedule.nextDueDate);
  if (due < today) return 'OVERDUE';
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  return due <= dayString(addDays(todayDate, schedule.leadDays)) ? 'DUE_SOON' : 'UPCOMING';
}
