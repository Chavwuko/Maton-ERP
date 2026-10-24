import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAppointment } from '../../test/fixtures';
import { ApiError } from '../../api/client';
import * as appointmentsApi from '../../api/appointments';
import { MyAppointmentsPanel } from './MyAppointmentsPanel';

vi.mock('../../api/appointments');

describe('MyAppointmentsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('lists my appointments with items, status and the store\'s feedback', async () => {
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([
      makeAppointment({
        status: 'COMPLETED',
        feedback: 'Handed over',
        feedbackBy: { id: 'k', firstName: 'Kay', lastName: 'Keeper', email: 'kay@acme.test' },
        issuedNote: 'Issued: 10 pcs Work gloves',
      }),
    ]);

    renderWithProviders(<MyAppointmentsPanel />);

    expect(await screen.findByText('Gloves for new hires')).toBeInTheDocument();
    expect(screen.getByText('Item collection / issue')).toBeInTheDocument();
    expect(screen.getByText('10 pcs Work gloves')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Handed over/)).toBeInTheDocument();
    expect(screen.getByText(/Kay Keeper/)).toBeInTheDocument();
    expect(screen.getByText('Issued: 10 pcs Work gloves')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows dashes when there are no items or feedback, and hides the generic type', async () => {
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([makeAppointment({ items: [], type: 'Other' })]);

    renderWithProviders(<MyAppointmentsPanel />);

    await screen.findByText('Gloves for new hires');
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('shows feedback without a name when nobody is recorded, and an issue note alone', async () => {
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([
      makeAppointment({ id: 'a1', subject: 'One', feedback: 'See you then' }),
      makeAppointment({ id: 'a2', subject: 'Two', issuedNote: 'No items issued' }),
    ]);

    renderWithProviders(<MyAppointmentsPanel />);

    expect(await screen.findByText('See you then')).toBeInTheDocument();
    expect(screen.getByText('No items issued')).toBeInTheDocument();
  });

  it('shows an empty state and an error state', async () => {
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<MyAppointmentsPanel />);
    expect(await screen.findByText('You have no appointments yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(appointmentsApi.listMyAppointments).mockRejectedValue(new ApiError(500, 'Server down'));
    renderWithProviders(<MyAppointmentsPanel />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('cancels an open appointment after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([makeAppointment({ status: 'APPROVED' })]);
    vi.mocked(appointmentsApi.cancelAppointment).mockResolvedValue(makeAppointment({ status: 'CANCELLED' }));

    renderWithProviders(<MyAppointmentsPanel />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(vi.mocked(appointmentsApi.cancelAppointment).mock.calls[0][0]).toBe('appt-1'));
    expect(await screen.findByText('Appointment cancelled')).toBeInTheDocument();
  });

  it('keeps the appointment when the confirmation is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([makeAppointment()]);

    renderWithProviders(<MyAppointmentsPanel />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(appointmentsApi.cancelAppointment).not.toHaveBeenCalled();
  });

  it('surfaces a failed cancel', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(appointmentsApi.listMyAppointments).mockResolvedValue([makeAppointment()]);
    vi.mocked(appointmentsApi.cancelAppointment)
      .mockRejectedValueOnce(new ApiError(400, 'This appointment is already completed'))
      .mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<MyAppointmentsPanel />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('This appointment is already completed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Failed to cancel appointment')).toBeInTheDocument();
  });
});
