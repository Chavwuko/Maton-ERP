import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAppointment } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { ApiError } from '../../api/client';
import * as appointmentsApi from '../../api/appointments';
import * as inventoryApi from '../../api/inventory';
import { BookPanel } from './BookPanel';

vi.mock('../../api/appointments');
vi.mock('../../api/inventory');

const slots = [
  { time: '09:00', booked: 0, capacity: 1, available: true },
  { time: '09:30', booked: 1, capacity: 1, available: false },
  { time: '10:00', booked: 0, capacity: 1, available: false },
];

const item = {
  id: 'item-1',
  organizationId: 'org-1',
  sku: 'GLV-1',
  name: 'Work gloves',
  description: null,
  unitOfMeasure: 'pcs',
  reorderPoint: null,
  reorderQuantity: null,
  categoryId: null,
  location: null,
  unitCost: '2.00',
  createdAt: '',
  updatedAt: '',
};

async function pickDate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Date', { exact: false }), '2026-10-26');
}

describe('BookPanel', () => {
  beforeEach(() => {
    vi.mocked(appointmentsApi.getSlots).mockResolvedValue({ working: true, slots });
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([item]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks for a date before showing any times', () => {
    renderWithProviders(<BookPanel />);

    expect(screen.getByText('Pick a date to see the available times.')).toBeInTheDocument();
    expect(appointmentsApi.getSlots).not.toHaveBeenCalled();
  });

  it('shows the day\'s slots, disabling full and past ones', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookPanel />);

    await pickDate(user);

    expect(await screen.findByRole('button', { name: '09:00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '09:30 (full)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '10:00' })).toBeDisabled();
    expect(appointmentsApi.getSlots).toHaveBeenCalledWith('2026-10-26');
  });

  it('explains a non-working day, and a failure to load slots', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.getSlots).mockResolvedValueOnce({ working: false, slots: [] });
    renderWithProviders(<BookPanel />);

    await pickDate(user);
    expect(await screen.findByText(/does not take appointments on this day/)).toBeInTheDocument();

    vi.mocked(appointmentsApi.getSlots).mockRejectedValue(new ApiError(400, 'date must look like 2026-10-24'));
    await user.clear(screen.getByLabelText('Date', { exact: false }));
    await user.type(screen.getByLabelText('Date', { exact: false }), '2026-10-27');
    expect(await screen.findByText('date must look like 2026-10-24')).toBeInTheDocument();
  });

  it('shows a generic message when slots fail without an API message', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.getSlots).mockRejectedValue(new Error('network'));
    renderWithProviders(<BookPanel />);

    await pickDate(user);

    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('needs a date, a slot and a subject', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookPanel />);

    await user.click(screen.getByRole('button', { name: 'Book appointment' }));
    expect(await screen.findByText('Choose a date')).toBeInTheDocument();
    expect(screen.getByText('Please give your appointment a subject')).toBeInTheDocument();

    await pickDate(user);
    await user.type(screen.getByLabelText('Subject', { exact: false }), 'Gloves');
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));
    expect(await screen.findByText('Choose a time slot')).toBeInTheDocument();
    expect(appointmentsApi.bookAppointment).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: '09:00' }));
    expect(screen.queryByText('Choose a time slot')).not.toBeInTheDocument();
  });

  it('books the chosen slot with the items requested', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.bookAppointment).mockResolvedValue(makeAppointment());
    renderWithProviders(<BookPanel />);

    await pickDate(user);
    await user.click(await screen.findByRole('button', { name: '09:00' }));
    await user.type(screen.getByLabelText('Subject', { exact: false }), 'Gloves for new hires');
    await user.click(screen.getByLabelText('Details'));
    await user.paste('Five new starters');
    await user.click(screen.getByRole('button', { name: 'Add an item' }));
    await pickOption(user, screen.getByPlaceholderText('Select item'), 'GLV-1 — Work gloves');
    await user.clear(screen.getByLabelText('Quantity 1'));
    await user.type(screen.getByLabelText('Quantity 1'), '10');
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.bookAppointment).mock.calls[0][0]).toEqual({
        date: '2026-10-26',
        time: '09:00',
        type: 'Item collection / issue',
        subject: 'Gloves for new hires',
        details: 'Five new starters',
        items: [{ itemId: 'item-1', quantity: 10 }],
      });
    });
    expect(await screen.findByText('Appointment booked. The store will review it.')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject', { exact: false })).toHaveValue('');
  });

  it('books without items or details', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.bookAppointment).mockResolvedValue(makeAppointment());
    renderWithProviders(<BookPanel />);

    await pickDate(user);
    await user.click(await screen.findByRole('button', { name: '09:00' }));
    await user.type(screen.getByLabelText('Subject', { exact: false }), 'Just a chat');
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.bookAppointment).mock.calls[0][0]).toMatchObject({
        subject: 'Just a chat',
        details: undefined,
        items: [],
      });
    });
  });

  it('checks each item row, and lets a row be removed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookPanel />);

    await pickDate(user);
    await user.click(await screen.findByRole('button', { name: '09:00' }));
    await user.type(screen.getByLabelText('Subject', { exact: false }), 'Gloves');
    await user.click(screen.getByRole('button', { name: 'Add an item' }));
    await user.clear(screen.getByLabelText('Quantity 1'));
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));

    expect(await screen.findByText('Choose an item')).toBeInTheDocument();
    expect(screen.getByText('Enter a quantity')).toBeInTheDocument();
    expect(appointmentsApi.bookAppointment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(screen.queryByLabelText('Quantity 1')).not.toBeInTheDocument();
  });

  it('surfaces a booking failure and refreshes the slots', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.bookAppointment).mockRejectedValueOnce(new ApiError(400, 'That time slot is full. Please pick another'));
    renderWithProviders(<BookPanel />);

    await pickDate(user);
    await user.click(await screen.findByRole('button', { name: '09:00' }));
    await user.type(screen.getByLabelText('Subject', { exact: false }), 'Gloves');
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));

    expect(await screen.findByText('That time slot is full. Please pick another')).toBeInTheDocument();
    await waitFor(() => expect(appointmentsApi.getSlots).toHaveBeenCalledTimes(2));

    vi.mocked(appointmentsApi.bookAppointment).mockRejectedValueOnce(new Error('network'));
    await user.click(await screen.findByRole('button', { name: '09:00' }));
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));
    expect(await screen.findByText('Failed to book appointment')).toBeInTheDocument();
  });

  it('forgets the chosen slot when the date changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookPanel />);

    await pickDate(user);
    const slot = await screen.findByRole('button', { name: '09:00' });
    await user.click(slot);
    expect(within(slot.closest('div')!.parentElement!).getByRole('button', { name: '09:00' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Date', { exact: false }));
    await user.type(screen.getByLabelText('Date', { exact: false }), '2026-10-27');
    await user.type(screen.getByLabelText('Subject', { exact: false }), 'Gloves');
    await user.click(screen.getByRole('button', { name: 'Book appointment' }));

    expect(await screen.findByText('Choose a time slot')).toBeInTheDocument();
  });
});
