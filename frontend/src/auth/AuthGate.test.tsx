import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { AuthGate } from './AuthGate';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

let authMode = 'local';
vi.mock('./authMode', () => ({
  getAuthMode: () => authMode,
}));
vi.mock('../api/auth');

describe('AuthGate', () => {
  beforeEach(() => {
    authMode = 'local';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders children immediately in AUTH_MODE=local, without calling GET /auth/me', async () => {
    renderWithProviders(
      <AuthGate>
        <div>protected content</div>
      </AuthGate>,
    );

    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('shows a login button when AUTH_MODE=cognito and there is no session', async () => {
    authMode = 'cognito';
    vi.mocked(authApi.getSession).mockRejectedValue(new ApiError(401, 'Missing bearer token'));

    renderWithProviders(
      <AuthGate>
        <div>protected content</div>
      </AuthGate>,
    );

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders children once AUTH_MODE=cognito resolves a session', async () => {
    authMode = 'cognito';
    vi.mocked(authApi.getSession).mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      roleName: 'admin',
      departmentId: null,
    });

    renderWithProviders(
      <AuthGate>
        <div>protected content</div>
      </AuthGate>,
    );

    expect(await screen.findByText('protected content')).toBeInTheDocument();
  });
});
