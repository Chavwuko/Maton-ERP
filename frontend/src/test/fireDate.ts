import { fireEvent } from '@testing-library/react';

// Native date inputs do not take typed text in jsdom; set the value the way
// the browser's picker would.
export function fireDate(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}
