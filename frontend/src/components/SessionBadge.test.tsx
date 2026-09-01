import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { SessionBadge } from './SessionBadge';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

describe('SessionBadge', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the session email and role once loaded', async () => {
    vi.mocked(authApi.getSession).mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      roleName: 'hse',
      departmentId: null,
    });

    renderWithProviders(<SessionBadge />);

    expect(await screen.findByText('a@b.com (hse)')).toBeInTheDocument();
  });

  it('always renders a log out link, even before the session loads', () => {
    vi.mocked(authApi.getSession).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<SessionBadge />);

    expect(screen.getByRole('link', { name: 'Log out' })).toBeInTheDocument();
  });
});
