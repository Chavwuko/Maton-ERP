import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { notifications } from '@mantine/notifications';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeUser } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as usersApi from '../../api/users';
import * as activityApi from '../../api/activity';
import { UsersListPage } from './UsersListPage';

vi.mock('../../api/users');
vi.mock('../../api/activity');
vi.mock('../../api/settings', () => ({
  getAccessSettings: vi.fn().mockResolvedValue({ openSignup: true, allowedEmailDomains: [] }),
  updateAccessSettings: vi.fn(),
}));
vi.mock('../../api/organizations', () => ({
  listDepartments: vi.fn().mockResolvedValue([{ id: 'dept-1', organizationId: 'org-1', name: 'Stores', code: 'STR', createdAt: '' }]),
}));

const jane = makeUser();
const newcomer = makeUser({
  id: 'user-2',
  email: 'new@acme.test',
  firstName: '',
  lastName: '',
  isActive: false,
  status: 'PENDING',
  role: null,
});
const keeper = makeUser({
  id: 'user-3',
  email: 'ann@acme.test',
  firstName: 'Ann',
  lastName: 'Store',
  role: { id: 'role-2', name: 'staff' },
  departmentId: 'dept-1',
  department: { id: 'dept-1', name: 'Stores' },
});
const sleeper = makeUser({ id: 'user-4', email: 'sam@acme.test', firstName: 'Sam', lastName: 'Off', isActive: false, status: 'DISABLED', role: { id: 'role-3', name: 'hse' } });

describe('UsersListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(usersApi.listUsers).mockImplementation(async (filters) =>
      filters?.status === 'PENDING' ? [newcomer] : filters?.status === 'REJECTED' ? [] : [jane, newcomer, keeper, sleeper],
    );
  });

  afterEach(() => {
    // Mantine shows at most five toasts; leftovers from earlier tests would queue later ones.
    notifications.clean();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the directory with role, department and a status badge, falling back to a dash for a blank name', async () => {
    renderWithProviders(<UsersListPage />);

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('jane@acme.test')).toBeInTheDocument();
    expect(table.getByText('admin')).toBeInTheDocument();
    expect(table.getByText('Stores')).toBeInTheDocument();
    expect(table.getAllByText('Active')).toHaveLength(2);
    expect(table.getByText('Pending')).toBeInTheDocument();
    expect(table.getByText('Disabled')).toBeInTheDocument();
    expect(table.getByText('new@acme.test')).toBeInTheDocument();
  });

  it('shows an empty state and an error state', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<UsersListPage />);
    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(usersApi.listUsers).mockRejectedValue(new ApiError(500, 'Server down'));
    renderWithProviders(<UsersListPage />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('shows admins a badge with the number of pending requests', async () => {
    renderWithProviders(<UsersListPage />);

    expect(await screen.findByLabelText('1 pending requests')).toBeInTheDocument();
  });

  it('keeps the review tabs and the management buttons away from non-admins', async () => {
    setCurrentRole('inventory');
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Jane Doe');

    expect(screen.queryByRole('tab', { name: /Access requests/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Sign-up settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(usersApi.listUsers).not.toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('offers edit and disable on active people, enable on disabled ones, and nothing on pending ones', async () => {
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Jane Doe');

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const rowFor = (email: string) => rows.find((row) => within(row).queryByText(email))!;
    expect(within(rowFor('jane@acme.test')).getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(within(rowFor('sam@acme.test')).getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(within(rowFor('sam@acme.test')).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(rowFor('new@acme.test')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('changes a role and department', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.updateUser).mockResolvedValue(keeper);
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Ann Store');

    const row = within(screen.getByRole('table')).getAllByRole('row').find((r) => within(r).queryByText('ann@acme.test'))!;
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit ann@acme.test' });
    expect(within(dialog).getByLabelText('Role')).toHaveValue('staff');
    await pickOption(user, within(dialog).getByLabelText('Role'), 'inventory');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(vi.mocked(usersApi.updateUser).mock.calls[0]).toEqual(['user-3', { roleName: 'inventory', departmentId: 'dept-1' }]);
    });
    expect(await screen.findByText('User updated')).toBeInTheDocument();
  });

  it('surfaces an error when the update is refused', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.updateUser).mockRejectedValue(new ApiError(400, 'This is the last active admin; make another user an admin first'));
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Jane Doe');

    const row = within(screen.getByRole('table')).getAllByRole('row').find((r) => within(r).queryByText('jane@acme.test'))!;
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/last active admin/)).toBeInTheDocument();
  });

  it('disables and re-enables people', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.disableUser).mockResolvedValue(keeper);
    vi.mocked(usersApi.enableUser).mockResolvedValue(sleeper);
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Ann Store');
    const rowFor = (email: string) =>
      within(screen.getByRole('table')).getAllByRole('row').find((r) => within(r).queryByText(email))!;

    await user.click(within(rowFor('ann@acme.test')).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(vi.mocked(usersApi.disableUser).mock.calls[0][0]).toBe('user-3'));
    expect(await screen.findByText('User disabled')).toBeInTheDocument();

    await user.click(within(rowFor('sam@acme.test')).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(vi.mocked(usersApi.enableUser).mock.calls[0][0]).toBe('user-4'));
    expect(await screen.findByText('User enabled')).toBeInTheDocument();
  });

  it('shows the API error when a disable is refused', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.disableUser).mockRejectedValue(new ApiError(400, 'You cannot disable your own account'));
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Jane Doe');

    const row = within(screen.getByRole('table')).getAllByRole('row').find((r) => within(r).queryByText('jane@acme.test'))!;
    await user.click(within(row).getByRole('button', { name: 'Disable' }));

    expect(await screen.findByText('You cannot disable your own account')).toBeInTheDocument();
  });

  it('uses generic messages when a failure carries no API message', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.disableUser).mockRejectedValue(new Error('network'));
    renderWithProviders(<UsersListPage />);
    await screen.findByText('Jane Doe');

    const row = within(screen.getByRole('table')).getAllByRole('row').find((r) => within(r).queryByText('jane@acme.test'))!;
    await user.click(within(row).getByRole('button', { name: 'Disable' }));

    expect(await screen.findByText('Failed to change user status')).toBeInTheDocument();
  });

  describe('tabs follow the URL', () => {
    beforeEach(() => {
      vi.mocked(activityApi.listActivity).mockResolvedValue([]);
    });

    it('opens the tab named in ?tab=', async () => {
      renderWithProviders(<UsersListPage />, { route: '/users?tab=activity' });

      expect(await screen.findByText('No activity matches.')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Activity log' })).toHaveAttribute('aria-selected', 'true');
    });

    it('opens the access requests tab for the link in the notification bell', async () => {
      renderWithProviders(<UsersListPage />, { route: '/users?tab=requests' });

      expect(await screen.findByRole('tab', { name: /Access requests/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('falls back to the directory for an unknown tab, or one this role may not see', async () => {
      const { unmount } = renderWithProviders(<UsersListPage />, { route: '/users?tab=bogus' });
      expect(await screen.findByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
      unmount();

      setCurrentRole('inventory');
      renderWithProviders(<UsersListPage />, { route: '/users?tab=activity' });
      expect(await screen.findByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByRole('tab', { name: 'Activity log' })).not.toBeInTheDocument();
    });

    it('switches tabs when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UsersListPage />);

      await user.click(await screen.findByRole('tab', { name: 'Activity log' }));
      expect(await screen.findByText('No activity matches.')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Users' }));
      expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
