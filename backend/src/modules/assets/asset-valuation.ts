import { Prisma } from '@prisma/client';
import { addInterval } from '../maintenance/schedules/schedule-dates';

type Money = Prisma.Decimal;

export interface Depreciable {
  method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
  cost: Money;
  salvage: Money;
  lifeMonths: number;
  // A calendar day held as midnight UTC.
  start: Date;
}

const money = (value: Money) => value.toDecimalPlaces(2);

// Book value after each whole month of life: index 0 is the cost and the last
// entry (index lifeMonths) is the salvage value. Every figure is rounded to
// the cent as it goes, so the monthly charges add up exactly.
export function bookValues({ method, cost, salvage, lifeMonths }: Depreciable): Money[] {
  const values = [cost];

  if (method === 'STRAIGHT_LINE') {
    const total = cost.minus(salvage);
    for (let month = 1; month <= lifeMonths; month++) {
      values.push(cost.minus(money(total.times(month).div(lifeMonths))));
    }
    return values;
  }

  // Double-declining balance: twice the straight-line rate on what is left,
  // switching to straight line over the remaining months once that writes
  // off more, which lands exactly on the salvage value in the last month.
  const rate = Prisma.Decimal.min(1, new Prisma.Decimal(2).div(lifeMonths));
  let book = cost;
  for (let month = 1; month <= lifeMonths; month++) {
    const declining = book.times(rate);
    const straight = book.minus(salvage).div(lifeMonths - month + 1);
    // Never write off more than what is left above the salvage value.
    book = book.minus(money(Prisma.Decimal.min(Prisma.Decimal.max(declining, straight), book.minus(salvage))));
    values.push(book);
  }
  return values;
}

// Whole months from `start` to `asOf` (a month counts once its day has come
// round), never negative.
export function monthsElapsed(start: Date, asOf: Date): number {
  let months = (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 + asOf.getUTCMonth() - start.getUTCMonth();
  if (asOf.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function valueAt(input: Depreciable, asOf: Date) {
  const months = Math.min(monthsElapsed(input.start, asOf), input.lifeMonths);
  const bookValue = bookValues(input)[months];
  return {
    monthsElapsed: months,
    accumulatedDepreciation: input.cost.minus(bookValue),
    bookValue,
    fullyDepreciated: months >= input.lifeMonths,
  };
}

// One row per year of life: what it was worth at the start, what was written
// off, and what is left at the end of the year.
export function yearlySchedule(input: Depreciable) {
  const values = bookValues(input);
  const rows: { year: number; endsOn: Date; opening: Money; depreciation: Money; closing: Money }[] = [];
  for (let from = 0, year = 1; from < input.lifeMonths; from += 12, year++) {
    const to = Math.min(from + 12, input.lifeMonths);
    rows.push({
      year,
      endsOn: addInterval(input.start, to, 'MONTHS'),
      opening: values[from],
      depreciation: values[from].minus(values[to]),
      closing: values[to],
    });
  }
  return rows;
}
