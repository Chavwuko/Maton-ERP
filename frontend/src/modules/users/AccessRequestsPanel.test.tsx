import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeUser } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { ApiError } from '../../api/client';
import * as usersApi from '../../api/users';
import { AccessRequestsPanel } from './AccessRequestsPanel';

vi.mock('../../api/users');
vi.mock('../../api/organizations', () => ({
  listDepartments: vi.fn().mockResolvedValue([
    { id: 'dept-1', organizationId: 'org-1', name: 'Stores', code: 'STR', createdAt: '' },
    { id: 'dept-2', organizationId: 'org-1', name: 'Workshop', code: 'WKS', createdAt: '' },
  ]),
}));

const ann = makeUser({
  id: 'user-2',
  email: 'ann@acme.test',
  firstName: 'Ann',
  lastName: 'Store',
  phone: '555-0100',
  isActive: false,
  status: 'PENDING',
  role: null,
  departmentId: 'dept-1',
  department: { id: 'dept-1', name: 'Stores' },
  requestedAt: '2026-03-05T10:00:00.000Z',
});
const silent = makeUser({
  id: 'user-3',
  email: 'silent@acme.test',
  firstName: '',
  lastName: '',
  isActive: false,
  status: 'PENDING',
  role: null,
});
const turnedAway = makeUser({
  id: 'user-4',
  email: 'no@acme.test',
  firstName: 'Nia',
  lastName: 'Out',
  isActive: false,
  status: 'REJECTED',
  role: null,
  rejectionReason: 'Not a contractor of ours',
});

describe('AccessRequestsPanel', () => {
  beforeEach(() => {
    vi.mocked(usersApi.listUsers).mockImplementation(async (filters) =>
      filters?.status === 'REJECTED' ? [turnedAway] : [ann, silent],
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists pending requests with contact details and when they were sent', async () => {
    renderWithProviders(<AccessRequestsPanel />);

    expect(await screen.findByText('Ann Store')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
    expect(screen.getByText('Stores')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-03-05T10:00:00.000Z').toLocaleDateString())).toBeInTheDocument();
    expect(screen.getByText('Details not sent yet')).toBeInTheDocument();
    expect(usersApi.listUsers).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('shows empty and error states', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<AccessRequestsPanel />);
    expect(await screen.findByText('No pending requests.')).toBeInTheDocument();
    unmount();

    vi.mocked(usersApi.listUsers).mockRejectedValue(new ApiError(500, 'Server down'));
    renderWithProviders(<AccessRequestsPanel />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('switches to rejected requests, which show the reason and can still be approved', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('Ann Store');

    await user.click(screen.getByText('Rejected'));

    expect(await screen.findByText('Not a contractor of ours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('shows dashes for a rejected request with no reason, and a pending one with no date or phone', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.listUsers).mockImplementation(async (filters) =>
      filters?.status === 'REJECTED' ? [{ ...turnedAway, rejectionReason: null }] : [silent],
    );
    renderWithProviders(<AccessRequestsPanel />);

    await screen.findByText('silent@acme.test');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);

    await user.click(screen.getByText('Rejected'));
    await screen.findByText('no@acme.test');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('says so when there are no rejected requests', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.listUsers).mockImplementation(async (filters) => (filters?.status === 'REJECTED' ? [] : [ann]));
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('Ann Store');

    await user.click(screen.getByText('Rejected'));

    expect(await screen.findByText('No rejected requests.')).toBeInTheDocument();
  });

  it('approves with a chosen role and keeps the department they asked for', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.approveUser).mockResolvedValue(ann);
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('Ann Store');

    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('ann@acme.test'))!;
    await user.click(within(row).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve ann@acme.test' });
    expect(within(dialog).getByLabelText('Role', { exact: false })).toHaveValue('staff');
    expect(within(dialog).getByPlaceholderText('Select department')).toHaveValue('Stores');
    await pickOption(user, within(dialog).getByLabelText('Role', { exact: false }), 'inventory');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(vi.mocked(usersApi.approveUser).mock.calls[0]).toEqual(['user-2', { roleName: 'inventory', departmentId: 'dept-1' }]);
    });
    expect(await screen.findByText('User approved')).toBeInTheDocument();
  });

  it('approves without a department when none was asked for or chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.approveUser).mockResolvedValue(silent);
    vi.mocked(usersApi.listUsers).mockResolvedValue([silent]);
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('silent@acme.test');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(vi.mocked(usersApi.approveUser).mock.calls[0]).toEqual(['user-3', { roleName: 'staff', departmentId: undefined }]);
    });
  });

  it('surfaces an error when approval is refused', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.approveUser).mockRejectedValue(new ApiError(400, 'A active user cannot be approved'));
    vi.mocked(usersApi.listUsers).mockResolvedValue([ann]);
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('Ann Store');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('A active user cannot be approved')).toBeInTheDocument();
  });

  it('rejects with a reason', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.rejectUser).mockResolvedValue(ann);
    vi.mocked(usersApi.listUsers).mockResolvedValue([ann]);
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('Ann Store');

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject ann@acme.test' });
    await user.click(within(dialog).getByLabelText('Reason', { exact: false }));
    await user.paste('Not one of our contractors');
    await user.click(within(dialog).getByRole('button', { name: 'Reject request' }));

    await waitFor(() => {
      expect(vi.mocked(usersApi.rejectUser).mock.calls[0]).toEqual(['user-2', { reason: 'Not one of our contractors' }]);
    });
    expect(await screen.findByText('Request rejected')).toBeInTheDocument();
  });

  it('rejects without a reason, and surfaces errors', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.rejectUser).mockRejectedValueOnce(new Error('network')).mockResolvedValue(ann);
    vi.mocked(usersApi.listUsers).mockResolvedValue([ann]);
    renderWithProviders(<AccessRequestsPanel />);
    await screen.findByText('Ann Store');

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reject request' }));
    expect(await screen.findByText('Failed to reject request')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Reject request' }));
    await waitFor(() => {
      expect(vi.mocked(usersApi.rejectUser).mock.calls[1]).toEqual(['user-2', { reason: undefined }]);
    });
  });
});
