import { Prisma } from '@prisma/client';
import { bookValues, monthsElapsed, valueAt, yearlySchedule, type Depreciable } from './asset-valuation';

const d = (value: string | number) => new Prisma.Decimal(value);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asNumbers = (values: Prisma.Decimal[]) => values.map((value) => value.toNumber());

const straight = (overrides: Partial<Depreciable> = {}): Depreciable => ({
  method: 'STRAIGHT_LINE',
  cost: d(12000),
  salvage: d(2000),
  lifeMonths: 60,
  start: day('2026-01-15'),
  ...overrides,
});
const declining = (overrides: Partial<Depreciable> = {}): Depreciable => straight({ method: 'DECLINING_BALANCE', ...overrides });

describe('asset valuation', () => {
  describe('bookValues', () => {
    it('straight line: the same amount off every month, from cost to salvage', () => {
      const values = bookValues(straight());

      expect(values).toHaveLength(61);
      expect(values[0].toNumber()).toBe(12000);
      expect(values[1].toNumber()).toBe(11833.33);
      expect(values[12].toNumber()).toBe(10000);
      expect(values[60].toNumber()).toBe(2000);
    });

    it('straight line with no salvage writes the whole cost off', () => {
      expect(asNumbers(bookValues(straight({ cost: d(300), salvage: d(0), lifeMonths: 3 })))).toEqual([300, 200, 100, 0]);
    });

    it('declining balance: twice the straight-line rate on what is left, switching to straight line at the end', () => {
      expect(asNumbers(bookValues(declining({ cost: d(300), salvage: d(0), lifeMonths: 3 })))).toEqual([300, 100, 33.33, 0]);
    });

    it('declining balance writes off more early on, never goes below salvage, and ends exactly on it', () => {
      const values = bookValues(declining());
      const straightValues = bookValues(straight());

      expect(values[0].toNumber()).toBe(12000);
      expect(values[1].toNumber()).toBe(11600);
      expect(values[12].lt(straightValues[12])).toBe(true);
      expect(values[60].toNumber()).toBe(2000);
      values.forEach((value, month) => {
        expect(value.gte(2000)).toBe(true);
        if (month > 0) expect(value.lte(values[month - 1])).toBe(true);
      });
    });

    it('declining balance over a single month goes straight to salvage', () => {
      expect(asNumbers(bookValues(declining({ lifeMonths: 1 })))).toEqual([12000, 2000]);
    });
  });

  describe('monthsElapsed', () => {
    const start = day('2026-01-15');

    it('counts a month once its day has come round', () => {
      expect(monthsElapsed(start, day('2026-02-14'))).toBe(0);
      expect(monthsElapsed(start, day('2026-02-15'))).toBe(1);
      expect(monthsElapsed(start, day('2027-01-15'))).toBe(12);
      expect(monthsElapsed(start, day('2027-01-14'))).toBe(11);
    });

    it('is zero on the start day and before it', () => {
      expect(monthsElapsed(start, start)).toBe(0);
      expect(monthsElapsed(start, day('2025-12-01'))).toBe(0);
    });
  });

  describe('valueAt', () => {
    it('is the cost before a full month has passed', () => {
      expect(valueAt(straight(), day('2026-02-01'))).toEqual({
        monthsElapsed: 0,
        accumulatedDepreciation: d(0),
        bookValue: d(12000),
        fullyDepreciated: false,
      });
    });

    it('reports what has been written off and what is left', () => {
      const value = valueAt(straight(), day('2027-01-15'));

      expect(value.monthsElapsed).toBe(12);
      expect(value.accumulatedDepreciation.toNumber()).toBe(2000);
      expect(value.bookValue.toNumber()).toBe(10000);
      expect(value.fullyDepreciated).toBe(false);
    });

    it('stops at salvage once the life is over', () => {
      const value = valueAt(straight(), day('2040-01-01'));

      expect(value.monthsElapsed).toBe(60);
      expect(value.bookValue.toNumber()).toBe(2000);
      expect(value.accumulatedDepreciation.toNumber()).toBe(10000);
      expect(value.fullyDepreciated).toBe(true);
    });
  });

  describe('yearlySchedule', () => {
    it('has a row per year with opening, charge and closing, the last year part-year', () => {
      const rows = yearlySchedule(straight({ cost: d(1800), salvage: d(0), lifeMonths: 18, start: day('2026-01-31') }));

      expect(rows.map((row) => [row.year, row.endsOn.toISOString().slice(0, 10), row.opening.toNumber(), row.depreciation.toNumber(), row.closing.toNumber()])).toEqual([
        [1, '2027-01-31', 1800, 1200, 600],
        [2, '2027-07-31', 600, 600, 0],
      ]);
    });

    it('adds up to cost less salvage for either method', () => {
      for (const input of [straight(), declining()]) {
        const rows = yearlySchedule(input);
        const total = rows.reduce((sum, row) => sum.plus(row.depreciation), d(0));

        expect(rows).toHaveLength(5);
        expect(total.toNumber()).toBe(10000);
        expect(rows[4].closing.toNumber()).toBe(2000);
      }
    });
  });
});
