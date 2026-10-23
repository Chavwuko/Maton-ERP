import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { getCurrentRole, setCurrentRole } from '../auth/roleStore';
import { getSignupPreviewEmail, setSignupPreviewEmail } from '../auth/signupPreviewStore';
import { pickOption } from '../test/pickOption';
import { RoleSwitcher } from './RoleSwitcher';

describe('RoleSwitcher', () => {
  afterEach(() => {
    setCurrentRole('admin');
    setSignupPreviewEmail(null);
    localStorage.clear();
  });

  it('switches the acting role, including the new staff and viewer roles', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleSwitcher />);

    await pickOption(user, screen.getAllByDisplayValue('admin')[0], 'staff');

    expect(getCurrentRole()).toBe('staff');
  });

  it('starts a sign-up preview for a valid email only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Try sign-up' }));
    const start = await screen.findByRole('button', { name: 'Start preview' });
    expect(start).toBeDisabled();

    await user.type(screen.getByLabelText("New user's email", { exact: false }), 'not-an-email');
    expect(start).toBeDisabled();

    await user.clear(screen.getByLabelText("New user's email", { exact: false }));
    await user.type(screen.getByLabelText("New user's email", { exact: false }), ' new.hire@acme.test ');
    expect(start).toBeEnabled();
    await user.click(start);

    expect(getSignupPreviewEmail()).toBe('new.hire@acme.test');
  });

  it('does not start a preview when the form is submitted with an invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Try sign-up' }));
    await user.type(await screen.findByLabelText("New user's email", { exact: false }), 'nope{Enter}');

    expect(getSignupPreviewEmail()).toBeNull();
  });
});
