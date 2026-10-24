import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as appointmentsApi from '../../api/appointments';
import { AppointmentsPage } from './AppointmentsPage';
import { appointmentDate, personName } from './types';

vi.mock('../../api/appointments');
vi.mock('../../api/inventory');

describe('AppointmentsPage', () => {
  beforeEach(() => {
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([]);
    vi.mocked(appointmentsApi.listAppointments).mockResolvedValue([]);
    vi.mocked(appointmentsApi.getAppointmentSchedule).mockResolvedValue({
      workStart: '08:00',
      workEnd: '17:00',
      slotMinutes: 30,
      slotCapacity: 1,
      workingDays: [1],
      timeZone: 'UTC',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setCurrentRole('admin');
  });

  it.each(['staff', 'viewer', 'hse'] as const)('gives %s the booking tabs only', (role) => {
    setCurrentRole(role);
    renderWithProviders(<AppointmentsPage />);

    expect(screen.getByRole('tab', { name: 'Book' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My appointments' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'All appointments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Schedule' })).not.toBeInTheDocument();
  });

  it('adds the store\'s list for inventory, without the schedule', () => {
    setCurrentRole('inventory');
    renderWithProviders(<AppointmentsPage />);

    expect(screen.getByRole('tab', { name: 'All appointments' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Schedule' })).not.toBeInTheDocument();
  });

  it('gives admin every tab', () => {
    setCurrentRole('admin');
    renderWithProviders(<AppointmentsPage />);

    expect(screen.getByRole('tab', { name: 'All appointments' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
  });
});

describe('appointment helpers', () => {
  it('shows a calendar date as that day whatever the viewer\'s zone', () => {
    expect(appointmentDate('2026-10-26T00:00:00.000Z')).toBe(new Date(2026, 9, 26).toLocaleDateString());
  });

  it('names people, falling back to their email', () => {
    expect(personName({ firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' })).toBe('Ann Store');
    expect(personName({ firstName: '', lastName: '', email: 'ann@acme.test' })).toBe('ann@acme.test');
  });

  describe('tabs follow the URL', () => {
    it('opens All appointments for the notification bell link', async () => {
      setCurrentRole('inventory');
      renderWithProviders(<AppointmentsPage />, { route: '/appointments?tab=all' });

      expect(await screen.findByRole('tab', { name: 'All appointments' })).toHaveAttribute('aria-selected', 'true');
    });

    it('falls back to Book when this role cannot see the tab', () => {
      setCurrentRole('staff');
      renderWithProviders(<AppointmentsPage />, { route: '/appointments?tab=all' });

      expect(screen.getByRole('tab', { name: 'Book' })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches tabs when clicked', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      setCurrentRole('admin');
      renderWithProviders(<AppointmentsPage />);

      await user.click(screen.getByRole('tab', { name: 'My appointments' }));

      expect(screen.getByRole('tab', { name: 'My appointments' })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
