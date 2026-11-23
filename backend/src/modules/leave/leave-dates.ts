import { addDays } from '../maintenance/schedules/schedule-dates';

// Dates here are calendar days held as midnight UTC; `workingDays` uses
// 0 = Sunday ... 6 = Saturday, like the store's schedule.
export const isWorkingDay = (date: Date, workingDays: number[]) => workingDays.includes(date.getUTCDay());

// Working days from `start` to `end`, both included.
export function workingDaysBetween(start: Date, end: Date, workingDays: number[]): number {
  let count = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (isWorkingDay(day, workingDays)) count += 1;
  }
  return count;
}

// The first working day after `date`: when someone on leave is expected back.
// A schedule with no working days at all would never end, so give up after a week.
export function nextWorkingDay(date: Date, workingDays: number[]): Date {
  let day = addDays(date, 1);
  for (let step = 0; step < 7 && !isWorkingDay(day, workingDays); step++) {
    day = addDays(day, 1);
  }
  return day;
}

