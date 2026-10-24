type Cell = string | number | null | undefined;

// A cell that starts with one of these is read as a formula by spreadsheet
// programs, so a hostile item name could run something when the file is
// opened. Text cells get a leading apostrophe; numbers are left alone.
const FORMULA_START = /^[=+\-@\t\r]/;

function escape(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  let text = String(cell);
  if (typeof cell === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The byte-order mark makes Excel open the file as UTF-8 (names with accents).
export function toCsv(headers: string[], rows: Cell[][]): string {
  return `﻿${[headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`;
}
