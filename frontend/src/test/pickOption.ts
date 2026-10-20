import { waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

// Opens a Mantine Select and clicks one of its options. Every Select keeps
// its own (closed) listbox mounted in a portal, so several selects with
// overlapping option text can be in the DOM at once — scope the lookup to
// the listbox this input controls rather than the whole document.
export async function pickOption(user: UserEvent, input: HTMLElement, optionText: string) {
  await user.click(input);
  const listboxId = input.getAttribute('aria-controls');
  const listbox = await waitFor(() => {
    const el = listboxId ? document.getElementById(listboxId) : null;
    if (!el) throw new Error('listbox not mounted yet');
    return el;
  });
  await user.click(within(listbox).getByText(optionText));
}
