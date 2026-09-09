import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hrApi from '../../api/hr';
import { MyAttendancePanel } from './MyAttendancePanel';
import type { AttendanceRecord } from './types';

vi.mock('../../api/hr');

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'att-1',
    employeeId: 'emp-1',
    date: new Date().toISOString(),
    clockIn: null,
    clockOut: null,
    status: 'PRESENT',
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MyAttendancePanel', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows an empty history and an enabled Clock In button when there is no record for today', async () => {
    vi.mocked(hrApi.getMyAttendance).mockResolvedValue([]);

    renderWithProviders(<MyAttendancePanel />);

    expect(await screen.findByText('No attendance records yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock In' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clock Out' })).toBeDisabled();
  });

  it('disables Clock In and enables Clock Out once clocked in today with no clock-out yet', async () => {
    vi.mocked(hrApi.getMyAttendance).mockResolvedValue([record({ clockIn: new Date().toISOString() })]);

    renderWithProviders(<MyAttendancePanel />);
    await screen.findByText('PRESENT');

    expect(screen.getByRole('button', { name: 'Clock In' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clock Out' })).toBeEnabled();
  });

  it('disables both buttons once the day is fully clocked out', async () => {
    vi.mocked(hrApi.getMyAttendance).mockResolvedValue([
      record({ clockIn: new Date().toISOString(), clockOut: new Date().toISOString() }),
    ]);

    renderWithProviders(<MyAttendancePanel />);
    await screen.findByText('PRESENT');

    expect(screen.getByRole('button', { name: 'Clock In' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clock Out' })).toBeDisabled();
  });

  it('clicking Clock In calls the API and shows a success notification', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.getMyAttendance).mockResolvedValue([]);
    vi.mocked(hrApi.clockIn).mockResolvedValue(record({ clockIn: new Date().toISOString() }));

    renderWithProviders(<MyAttendancePanel />);
    await screen.findByText('No attendance records yet.');

    await user.click(screen.getByRole('button', { name: 'Clock In' }));

    await waitFor(() => expect(hrApi.clockIn).toHaveBeenCalled());
    expect(await screen.findByText('Clocked in')).toBeInTheDocument();
  });
});
