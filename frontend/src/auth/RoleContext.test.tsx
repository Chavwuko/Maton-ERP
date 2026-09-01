import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { useRole } from './RoleContext';
import * as authApi from '../api/auth';

let authMode = 'local';
vi.mock('./authMode', () => ({
  getAuthMode: () => authMode,
}));
vi.mock('../api/auth');

function RoleProbe() {
  const { role, setRole } = useRole();
  return (
    <div>
      <span>role: {role}</span>
      <button onClick={() => setRole('hse')}>switch to hse</button>
    </div>
  );
}

describe('RoleProvider', () => {
  beforeEach(() => {
    authMode = 'local';
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('AUTH_MODE=local: defaults to admin and setRole actually switches it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleProbe />);

    expect(await screen.findByText('role: admin')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch to hse' }));

    expect(await screen.findByText('role: hse')).toBeInTheDocument();
  });

  it('AUTH_MODE=cognito: resolves the role from the session and setRole is a no-op', async () => {
    authMode = 'cognito';
    vi.mocked(authApi.getSession).mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      roleName: 'maintenance',
      departmentId: null,
    });
    const user = userEvent.setup();

    renderWithProviders(<RoleProbe />);

    expect(await screen.findByText('role: maintenance')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch to hse' }));

    expect(screen.getByText('role: maintenance')).toBeInTheDocument();
  });

  it('AUTH_MODE=cognito: falls back to a non-matching role when the session has none assigned', async () => {
    authMode = 'cognito';
    vi.mocked(authApi.getSession).mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      roleName: null,
      departmentId: null,
    });

    renderWithProviders(<RoleProbe />);

    expect(await screen.findByText('role: none')).toBeInTheDocument();
  });
});
