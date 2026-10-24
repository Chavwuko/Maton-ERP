import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header row and data rows with a byte-order mark and CRLF line ends', () => {
    expect(toCsv(['A', 'B'], [[1, 'x'], [2.5, 'y']])).toBe('﻿A,B\r\n1,x\r\n2.5,y\r\n');
  });

  it('quotes cells holding commas, quotes or line breaks, doubling the quotes', () => {
    expect(toCsv(['Name'], [['Smith, J'], ['say "hi"'], ['two\nlines']])).toBe(
      '﻿Name\r\n"Smith, J"\r\n"say ""hi"""\r\n"two\nlines"\r\n',
    );
  });

  it('leaves empty and missing cells blank', () => {
    expect(toCsv(['A', 'B', 'C'], [[null, undefined, '']])).toBe('﻿A,B,C\r\n,,\r\n');
  });

  it('defuses text that a spreadsheet would run as a formula, but not plain numbers', () => {
    const csv = toCsv(['Cell'], [['=SUM(A1)'], ['+1'], ['-x'], ['@cmd'], [-5], ['safe']]);

    expect(csv).toBe("﻿Cell\r\n'=SUM(A1)\r\n'+1\r\n'-x\r\n'@cmd\r\n-5\r\nsafe\r\n");
  });
});
