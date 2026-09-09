import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hrApi from '../../api/hr';
import { ShiftAttendancePage } from './ShiftAttendancePage';

vi.mock('../../api/hr');

describe('ShiftAttendancePage', () => {
  beforeEach(() => {
    vi.mocked(hrApi.getMyAttendance).mockResolvedValue([]);
    vi.mocked(hrApi.listShifts).mockResolvedValue([]);
    vi.mocked(hrApi.listAttendance).mockResolvedValue([]);
    vi.mocked(hrApi.listEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows all three tabs for admin/hr', async () => {
    setCurrentRole('admin');
    renderWithProviders(<ShiftAttendancePage />);

    expect(await screen.findByRole('tab', { name: 'My Attendance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shifts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Team Attendance' })).toBeInTheDocument();
  });

  it('shows only My Attendance for a non-manager role', async () => {
    setCurrentRole('finance');
    renderWithProviders(<ShiftAttendancePage />);

    expect(await screen.findByRole('tab', { name: 'My Attendance' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Shifts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Team Attendance' })).not.toBeInTheDocument();
  });
});
