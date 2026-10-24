import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from './saveFile';

describe('saveTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the text to the browser as a named download, then tidies up', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    saveTextFile('suppliers.csv', 'a,b');

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await blob.text()).toBe('a,b');
    expect(clicked?.download).toBe('suppliers.csv');
    expect(clicked?.href).toBe('blob:fake');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('uses the given content type', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    saveTextFile('notes.txt', 'hi', 'text/plain');

    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('text/plain');
  });
});
