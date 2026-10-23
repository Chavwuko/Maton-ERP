import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeUser } from '../test/fixtures';
import { pickOption } from '../test/pickOption';
import * as usersApi from '../api/users';
import { UserMultiSelect } from './UserMultiSelect';
import { UserSelect } from './UserSelect';

vi.mock('../api/users');

describe('user pickers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('only offer active people, so anyone still waiting for approval is never assignable', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser({ firstName: 'Jane', lastName: 'Doe' })]);

    renderWithProviders(<UserSelect roleFilter="hse" />);
    renderWithProviders(<UserMultiSelect roleFilter={['hse', 'admin']} />);

    await vi.waitFor(() => {
      expect(usersApi.listUsers).toHaveBeenCalledWith({ role: 'hse', status: 'ACTIVE' });
      expect(usersApi.listUsers).toHaveBeenCalledWith({ role: ['hse', 'admin'], status: 'ACTIVE' });
    });
  });

  it('label people by name and email, falling back to the email when the name is blank', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.listUsers).mockResolvedValue([
      makeUser({ id: 'u1', email: 'jane@acme.test', firstName: 'Jane', lastName: 'Doe' }),
      makeUser({ id: 'u2', email: 'blank@acme.test', firstName: '', lastName: '' }),
    ]);

    renderWithProviders(<UserSelect />);
    await vi.waitFor(() => expect(usersApi.listUsers).toHaveBeenCalled());
    await pickOption(user, screen.getByPlaceholderText('Select user'), 'Jane Doe (jane@acme.test)');

    expect(screen.getByPlaceholderText('Select user')).toHaveValue('Jane Doe (jane@acme.test)');
  });
});
