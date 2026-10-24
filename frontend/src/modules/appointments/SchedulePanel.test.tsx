import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ApiError } from '../../api/client';
import * as appointmentsApi from '../../api/appointments';
import { SchedulePanel } from './SchedulePanel';

vi.mock('../../api/appointments');

const schedule = {
  workStart: '08:00',
  workEnd: '17:00',
  slotMinutes: 30,
  slotCapacity: 2,
  workingDays: [1, 2, 3, 4, 5],
  timeZone: 'Africa/Lagos',
};

describe('SchedulePanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the current schedule', async () => {
    vi.mocked(appointmentsApi.getAppointmentSchedule).mockResolvedValue(schedule);

    renderWithProviders(<SchedulePanel />);

    expect(await screen.findByLabelText('Opens')).toHaveValue('08:00');
    expect(screen.getByLabelText('Closes')).toHaveValue('17:00');
    expect(screen.getByLabelText('Appointment length (minutes)')).toHaveValue('30');
    expect(screen.getByLabelText('Appointments per slot')).toHaveValue('2');
    expect(screen.getByLabelText('Time zone')).toHaveValue('Africa/Lagos');
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sat' })).not.toBeChecked();
  });

  it('saves changes', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.getAppointmentSchedule).mockResolvedValue(schedule);
    vi.mocked(appointmentsApi.updateAppointmentSchedule).mockResolvedValue(schedule);

    renderWithProviders(<SchedulePanel />);
    await user.click(await screen.findByRole('checkbox', { name: 'Sat' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fri' }));
    const capacity = screen.getByLabelText('Appointments per slot');
    await user.clear(capacity);
    await user.type(capacity, '4');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.updateAppointmentSchedule).mock.calls[0][0]).toEqual({
        workStart: '08:00',
        workEnd: '17:00',
        slotMinutes: 30,
        slotCapacity: 4,
        workingDays: [1, 2, 3, 4, 6],
        timeZone: 'Africa/Lagos',
      });
    });
    expect(await screen.findByText('Schedule saved')).toBeInTheDocument();
  });

  it('needs a working day and a time zone', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.getAppointmentSchedule).mockResolvedValue({ ...schedule, workingDays: [1] });

    renderWithProviders(<SchedulePanel />);
    await user.click(await screen.findByRole('checkbox', { name: 'Mon' }));
    await user.clear(screen.getByLabelText('Time zone'));
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(await screen.findByText('Select at least one working day')).toBeInTheDocument();
    expect(screen.getByText('Enter a time zone, e.g. Africa/Lagos')).toBeInTheDocument();
    expect(appointmentsApi.updateAppointmentSchedule).not.toHaveBeenCalled();
  });

  it('surfaces a save failure', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.getAppointmentSchedule).mockResolvedValue(schedule);
    vi.mocked(appointmentsApi.updateAppointmentSchedule)
      .mockRejectedValueOnce(new ApiError(400, 'Slot length must be between 10 and 240 minutes, in steps of 5'))
      .mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<SchedulePanel />);
    await user.click(await screen.findByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByText(/Slot length must be between/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByText('Failed to save schedule')).toBeInTheDocument();
  });

  it('shows an error when the schedule cannot be loaded', async () => {
    vi.mocked(appointmentsApi.getAppointmentSchedule).mockRejectedValueOnce(new ApiError(500, 'Server down'));
    const { unmount } = renderWithProviders(<SchedulePanel />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
    unmount();

    vi.mocked(appointmentsApi.getAppointmentSchedule).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<SchedulePanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
