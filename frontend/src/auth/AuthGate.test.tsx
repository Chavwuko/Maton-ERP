import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeSession } from '../test/fixtures';
import { pickOption } from '../test/pickOption';
import { AuthGate } from './AuthGate';
import { getSignupPreviewEmail, setSignupPreviewEmail } from './signupPreviewStore';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

let authMode = 'local';
vi.mock('./authMode', () => ({
  getAuthMode: () => authMode,
}));
vi.mock('../api/auth');
vi.mock('../api/organizations', () => ({
  listDepartments: vi.fn().mockResolvedValue([{ id: 'dept-1', organizationId: 'org-1', name: 'Stores', code: 'STR', createdAt: '' }]),
}));

const gate = () =>
  renderWithProviders(
    <AuthGate>
      <div>protected content</div>
    </AuthGate>,
  );

describe('AuthGate', () => {
  beforeEach(() => {
    authMode = 'local';
  });

  afterEach(() => {
    vi.clearAllMocks();
    setSignupPreviewEmail(null);
  });

  it('renders children immediately in AUTH_MODE=local, without calling GET /auth/me', async () => {
    gate();

    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  describe('AUTH_MODE=cognito', () => {
    beforeEach(() => {
      authMode = 'cognito';
    });

    it('shows a login button when there is no session', async () => {
      vi.mocked(authApi.getSession).mockRejectedValue(new ApiError(401, 'Missing bearer token'));

      gate();

      expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    });

    it('renders children once an active session resolves', async () => {
      vi.mocked(authApi.getSession).mockResolvedValue(makeSession({ status: 'ACTIVE', roleName: 'admin' }));

      gate();

      expect(await screen.findByText('protected content')).toBeInTheDocument();
    });

    it('asks a brand-new sign-up for their details instead of opening the app', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.getSession)
        .mockResolvedValueOnce(makeSession())
        .mockResolvedValue(makeSession({ firstName: 'Pat', lastName: 'Pending' }));
      vi.mocked(authApi.requestAccess).mockResolvedValue({});

      gate();

      expect(await screen.findByRole('heading', { name: 'Request access' })).toBeInTheDocument();
      expect(screen.getByText('Signed in as pat@acme.test')).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();

      await user.type(screen.getByLabelText('First name', { exact: false }), 'Pat');
      await user.type(screen.getByLabelText('Last name', { exact: false }), 'Pending');
      await user.type(screen.getByLabelText('Phone'), '555-0100');
      await pickOption(user, screen.getByPlaceholderText('Select department'), 'Stores');
      await user.click(screen.getByRole('button', { name: 'Send request' }));

      await waitFor(() => {
        expect(vi.mocked(authApi.requestAccess).mock.calls[0][0]).toEqual({
          firstName: 'Pat',
          lastName: 'Pending',
          phone: '555-0100',
          departmentId: 'dept-1',
        });
      });
      expect(await screen.findByText('Access request sent')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument();
    });

    it('validates the names and surfaces API errors', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.getSession).mockResolvedValue(makeSession());
      vi.mocked(authApi.requestAccess).mockRejectedValue(new ApiError(400, 'First name and last name are required'));

      gate();
      await screen.findByRole('heading', { name: 'Request access' });

      await user.click(screen.getByRole('button', { name: 'Send request' }));
      expect(await screen.findByText('First name is required')).toBeInTheDocument();
      expect(screen.getByText('Last name is required')).toBeInTheDocument();
      expect(authApi.requestAccess).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText('First name', { exact: false }), 'Pat');
      await user.type(screen.getByLabelText('Last name', { exact: false }), 'Pending');
      await user.click(screen.getByRole('button', { name: 'Send request' }));

      expect(await screen.findByText('First name and last name are required')).toBeInTheDocument();
      expect(vi.mocked(authApi.requestAccess).mock.calls[0][0]).toEqual({
        firstName: 'Pat',
        lastName: 'Pending',
        phone: undefined,
        departmentId: undefined,
      });
    });

    it('shows a waiting screen once details are in, and lets the person edit them', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.getSession).mockResolvedValue(
        makeSession({ firstName: 'Pat', lastName: 'Pending', phone: '555', departmentId: 'dept-1' }),
      );

      gate();

      expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument();
      expect(screen.getByText(/Thanks, Pat/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Log out' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Edit my details' }));

      expect(screen.getByLabelText('First name', { exact: false })).toHaveValue('Pat');
      expect(screen.getByLabelText('Phone')).toHaveValue('555');
      expect(screen.getByRole('button', { name: 'Update request' })).toBeInTheDocument();
    });

    it('opens the app by itself once an approval arrives while waiting', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        vi.mocked(authApi.getSession)
          .mockResolvedValueOnce(makeSession({ firstName: 'Pat', lastName: 'Pending' }))
          .mockResolvedValue(makeSession({ firstName: 'Pat', lastName: 'Pending', status: 'ACTIVE', roleName: 'staff' }));

        gate();
        await screen.findByRole('heading', { name: 'Waiting for approval' });

        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_500);
        });

        expect(await screen.findByText('protected content')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('tells a rejected person why', async () => {
      vi.mocked(authApi.getSession).mockResolvedValue(
        makeSession({ status: 'REJECTED', rejectionReason: 'Not a contractor of ours' }),
      );

      gate();

      expect(await screen.findByRole('heading', { name: 'Access request not approved' })).toBeInTheDocument();
      expect(screen.getByText('Not a contractor of ours')).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    });

    it('falls back to a generic message when a rejection has no reason', async () => {
      vi.mocked(authApi.getSession).mockResolvedValue(makeSession({ status: 'REJECTED' }));

      gate();

      expect(await screen.findByText('An administrator did not approve this request.')).toBeInTheDocument();
    });

    it('tells a disabled person their account is off', async () => {
      vi.mocked(authApi.getSession).mockResolvedValue(makeSession({ status: 'DISABLED', roleName: 'hse' }));

      gate();

      expect(await screen.findByRole('heading', { name: 'Account disabled' })).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    });
  });

  describe('local sign-up preview', () => {
    it('runs the session flow for the previewed email and sends it as the preview header', async () => {
      setSignupPreviewEmail('new.hire@acme.test');
      vi.mocked(authApi.getSession).mockResolvedValue(makeSession({ email: 'new.hire@acme.test' }));

      gate();

      expect(await screen.findByRole('heading', { name: 'Request access' })).toBeInTheDocument();
      expect(screen.getByText('Signed in as new.hire@acme.test')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Log out' })).not.toBeInTheDocument();
    });

    it('leaves the preview from the request screen', async () => {
      const user = userEvent.setup();
      setSignupPreviewEmail('new.hire@acme.test');
      vi.mocked(authApi.getSession).mockResolvedValue(makeSession({ email: 'new.hire@acme.test' }));

      gate();
      await screen.findByRole('heading', { name: 'Request access' });

      await user.click(screen.getByRole('button', { name: 'Exit sign-up preview' }));

      expect(getSignupPreviewEmail()).toBeNull();
      expect(await screen.findByText('protected content')).toBeInTheDocument();
    });

    it('says the person is approved, with their role, instead of loading the app as someone else', async () => {
      const user = userEvent.setup();
      setSignupPreviewEmail('new.hire@acme.test');
      vi.mocked(authApi.getSession).mockResolvedValue(
        makeSession({ email: 'new.hire@acme.test', status: 'ACTIVE', roleName: 'inventory' }),
      );

      gate();

      expect(await screen.findByRole('heading', { name: 'You are approved' })).toBeInTheDocument();
      const card = screen.getByRole('heading', { name: 'You are approved' }).closest('div')!.parentElement!;
      expect(within(card).getByText('inventory')).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Exit sign-up preview' }));
      expect(await screen.findByText('protected content')).toBeInTheDocument();
    });

    it('shows the exit button, not a Cognito login, if the preview session cannot be loaded', async () => {
      const user = userEvent.setup();
      setSignupPreviewEmail('new.hire@acme.test');
      vi.mocked(authApi.getSession).mockRejectedValue(new ApiError(500, 'boom'));

      gate();

      await user.click(await screen.findByRole('button', { name: 'Exit sign-up preview' }));
      expect(await screen.findByText('protected content')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    });

    it('shows a disabled or rejected preview person the blocked screen with an exit button', async () => {
      setSignupPreviewEmail('new.hire@acme.test');
      vi.mocked(authApi.getSession).mockResolvedValue(
        makeSession({ email: 'new.hire@acme.test', status: 'REJECTED', rejectionReason: 'Sign-ups are currently closed.' }),
      );

      gate();

      expect(await screen.findByText('Sign-ups are currently closed.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Exit sign-up preview' })).toBeInTheDocument();
    });
  });
});
