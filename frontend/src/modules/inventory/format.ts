// Quantities are stored to 3 dp and money to 2 dp; show them without
// trailing noise (e.g. 800.5, not 800.500) but keep money at 2 dp.
export function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function formatMoney(value: string | number): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
