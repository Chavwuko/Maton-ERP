import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { setCurrentRole } from '../auth/roleStore';
import * as notificationsApi from '../api/notifications';
import { NotificationBell } from './NotificationBell';

vi.mock('../api/notifications');

const waiting = {
  access: [
    { id: 'u1', name: 'Pat Pending', email: 'pat@acme.test', department: 'Stores', submitted: true, createdAt: '2026-10-20T10:00:00.000Z' },
    { id: 'u2', name: 'silent@acme.test', email: 'silent@acme.test', department: null, submitted: false, createdAt: '2026-10-21T10:00:00.000Z' },
  ],
  appointments: [
    { id: 'a1', date: '2026-10-26T00:00:00.000Z', time: '09:00', subject: 'Gloves', requesterName: 'Ann Store', department: 'Workshop' },
  ],
  counts: { access: 2, appointments: 1, total: 3 },
};

describe('NotificationBell', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(notificationsApi.getNotifications).mockResolvedValue(waiting);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows how many things are waiting', async () => {
    renderWithProviders(<NotificationBell />);

    expect(await screen.findByRole('button', { name: 'Notifications, 3 waiting' }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('lists sign-up requests and appointments, each linking to its tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: 'Notifications, 3 waiting' }, { timeout: 5000 }));

    const request = await screen.findByRole('link', { name: 'Pat Pending' });
    expect(request).toHaveAttribute('href', '/users?tab=requests');
    expect(screen.getByText(/silent@acme.test/)).toHaveTextContent('details not sent yet');
    expect(screen.getByText(/silent@acme.test/).closest('a')).toHaveAttribute('href', '/users?tab=requests');
    const appointment = screen.getByText(/Gloves — Ann Store/).closest('a')!;
    expect(appointment).toHaveAttribute('href', '/appointments?tab=all');
  });

  it('says when nothing is waiting', async () => {
    const user = userEvent.setup();
    vi.mocked(notificationsApi.getNotifications).mockResolvedValue({ access: [], appointments: [], counts: { access: 0, appointments: 0, total: 0 } });
    renderWithProviders(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: 'Notifications' }, { timeout: 5000 }));

    expect(await screen.findByText('Nothing is waiting for you.')).toBeInTheDocument();
  });

  it('caps a large count', async () => {
    vi.mocked(notificationsApi.getNotifications).mockResolvedValue({
      ...waiting,
      counts: { access: 0, appointments: 150, total: 150 },
    });
    renderWithProviders(<NotificationBell />);

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('shows the inventory role only appointments', async () => {
    const user = userEvent.setup();
    setCurrentRole('inventory');
    vi.mocked(notificationsApi.getNotifications).mockResolvedValue({
      access: [],
      appointments: waiting.appointments,
      counts: { access: 0, appointments: 1, total: 1 },
    });
    renderWithProviders(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 waiting' }, { timeout: 5000 }));

    expect(await screen.findByText('Appointments to review')).toBeInTheDocument();
    expect(screen.queryByText('Sign-up requests')).not.toBeInTheDocument();
  });

  it.each(['staff', 'viewer', 'hse'] as const)('is not shown to %s, and asks for nothing', (role) => {
    setCurrentRole(role);

    renderWithProviders(<NotificationBell />);

    expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
    expect(notificationsApi.getNotifications).not.toHaveBeenCalled();
  });
});
