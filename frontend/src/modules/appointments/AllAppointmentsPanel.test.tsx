import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAppointment } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { ApiError } from '../../api/client';
import * as appointmentsApi from '../../api/appointments';
import * as inventoryApi from '../../api/inventory';
import { AllAppointmentsPanel } from './AllAppointmentsPanel';

vi.mock('../../api/appointments');
vi.mock('../../api/inventory');
vi.mock('../../api/projects', () => ({
  listProjects: vi.fn().mockResolvedValue([{ id: 'proj-1', code: 'P-01', name: 'Substation' }]),
}));

const warehouse = { id: 'wh-1', organizationId: 'org-1', code: 'MAIN', name: 'Main store', location: null, createdAt: '' };

const overview = [
  {
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
    totalOnHand: 47,
    stockValue: '94.00',
    status: 'IN_STOCK' as const,
  },
];

const pending = makeAppointment();
const approved = makeAppointment({ id: 'appt-2', subject: 'Approved one', status: 'APPROVED' });
const done = makeAppointment({ id: 'appt-3', subject: 'Finished one', status: 'COMPLETED' });

describe('AllAppointmentsPanel', () => {
  beforeEach(() => {
    vi.mocked(appointmentsApi.listAppointments).mockResolvedValue([pending, approved, done]);
    vi.mocked(inventoryApi.getStockOverview).mockResolvedValue(overview);
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([warehouse]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('lists every appointment with requester, department and status; only open ones can be reviewed', async () => {
    renderWithProviders(<AllAppointmentsPanel />);

    expect(await screen.findByText('Gloves for new hires')).toBeInTheDocument();
    expect(screen.getAllByText('Ann Store')).toHaveLength(3);
    expect(screen.getAllByText('Workshop')).toHaveLength(3);
    // The status filter keeps its option names mounted, so look in the table.
    expect(within(screen.getByRole('table')).getByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
  });

  it('names a requester with no department or name', async () => {
    vi.mocked(appointmentsApi.listAppointments).mockResolvedValue([
      makeAppointment({ department: null, requester: { id: 'u', firstName: '', lastName: '', email: 'nobody@acme.test' } }),
    ]);

    renderWithProviders(<AllAppointmentsPanel />);

    expect(await screen.findByText('nobody@acme.test')).toBeInTheDocument();
    expect(screen.getByText('No department')).toBeInTheDocument();
  });

  it('shows empty and error states', async () => {
    vi.mocked(appointmentsApi.listAppointments).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<AllAppointmentsPanel />);
    expect(await screen.findByText('No appointments match.')).toBeInTheDocument();
    unmount();

    vi.mocked(appointmentsApi.listAppointments).mockRejectedValue(new ApiError(403, 'Forbidden resource'));
    renderWithProviders(<AllAppointmentsPanel />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('filters by status and date range', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AllAppointmentsPanel />);
    await screen.findByText('Gloves for new hires');

    await pickOption(user, screen.getByPlaceholderText('All statuses'), 'Pending');
    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.type(screen.getByLabelText('To'), '2026-10-31');

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.listAppointments)).toHaveBeenLastCalledWith({
        status: 'PENDING',
        from: '2026-10-01',
        to: '2026-10-31',
      });
    });
  });

  it('approves a pending appointment without needing feedback', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.reviewAppointment).mockResolvedValue(approved);
    renderWithProviders(<AllAppointmentsPanel />);

    const row = (await screen.findByText('Gloves for new hires')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.reviewAppointment).mock.calls[0]).toEqual([
        'appt-1',
        { decision: 'APPROVED', feedback: undefined },
      ]);
    });
    expect(await screen.findByText('Appointment approved')).toBeInTheDocument();
  });

  it('requires feedback to decline, then sends it', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.reviewAppointment).mockResolvedValue(pending);
    renderWithProviders(<AllAppointmentsPanel />);

    const row = (await screen.findByText('Gloves for new hires')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await pickOption(user, within(dialog).getByLabelText('Decision'), 'Decline');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(await within(dialog).findByText('Please add feedback for the requester')).toBeInTheDocument();
    expect(appointmentsApi.reviewAppointment).not.toHaveBeenCalled();

    await user.click(within(dialog).getByLabelText('Feedback for the requester', { exact: false }));
    await user.paste('Please come back Monday');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.reviewAppointment).mock.calls[0][1]).toEqual({
        decision: 'DECLINED',
        feedback: 'Please come back Monday',
      });
    });
    expect(await screen.findByText('Appointment declined')).toBeInTheDocument();
  });

  it('offers only decline and complete for an approved appointment', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AllAppointmentsPanel />);

    const row = (await screen.findByText('Approved one')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText('Decision')).toHaveValue('Complete (hand over items)');
    await user.click(within(dialog).getByLabelText('Decision'));
    expect(screen.queryByRole('option', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('completes with the requested items prefilled, issuing from a warehouse', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.reviewAppointment).mockResolvedValue(done);
    renderWithProviders(<AllAppointmentsPanel />);

    const row = (await screen.findByText('Approved one')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('GLV-1 — Work gloves')).toBeInTheDocument();
    expect(await within(dialog).findByText('47 pcs on hand')).toBeInTheDocument();
    expect(within(dialog).getByText('Optional. Otherwise charged to Workshop.')).toBeInTheDocument();

    const quantity = within(dialog).getByLabelText('Quantity to issue: GLV-1 — Work gloves');
    expect(quantity).toHaveValue('10');
    await user.clear(quantity);
    await user.type(quantity, '8');
    await user.click(within(dialog).getByLabelText('Feedback for the requester', { exact: false }));
    await user.paste('Handed over');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'MAIN — Main store');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.reviewAppointment).mock.calls[0]).toEqual([
        'appt-2',
        {
          decision: 'COMPLETED',
          feedback: 'Handed over',
          warehouseId: 'wh-1',
          projectId: undefined,
          issue: [{ itemId: 'item-1', quantity: 8 }],
        },
      ]);
    });
    expect(await screen.findByText('Appointment completed')).toBeInTheDocument();
  });

  it('needs a warehouse, and a project when the requester has no department', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.listAppointments).mockResolvedValue([makeAppointment({ department: null, departmentId: null })]);
    vi.mocked(appointmentsApi.reviewAppointment).mockResolvedValue(pending);
    renderWithProviders(<AllAppointmentsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await pickOption(user, within(dialog).getByLabelText('Decision'), 'Complete (hand over items)');
    expect(within(dialog).getByText('Needed: this requester has no department.')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Feedback for the requester', { exact: false }));
    await user.paste('Done');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));

    expect(await within(dialog).findByText('Choose the warehouse to issue from')).toBeInTheDocument();
    expect(within(dialog).getByText(/Choose a project \/ job to charge the items to/)).toBeInTheDocument();
    expect(appointmentsApi.reviewAppointment).not.toHaveBeenCalled();

    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'MAIN — Main store');
    await pickOption(user, within(dialog).getByPlaceholderText('Select project'), 'P-01 — Substation');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.reviewAppointment).mock.calls[0][1]).toMatchObject({
        warehouseId: 'wh-1',
        projectId: 'proj-1',
      });
    });
  });

  it('can complete without issuing anything, dropping lines or zero quantities', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.reviewAppointment).mockResolvedValue(done);
    renderWithProviders(<AllAppointmentsPanel />);

    const row = (await screen.findByText('Approved one')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Do not issue GLV-1 — Work gloves' }));
    expect(within(dialog).getByText('No items will be issued.')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Feedback for the requester', { exact: false }));
    await user.paste('Just a chat');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));

    await waitFor(() => {
      expect(vi.mocked(appointmentsApi.reviewAppointment).mock.calls[0][1]).toMatchObject({ issue: [] });
    });
  });

  it('surfaces a stock shortage or other failure from the API', async () => {
    const user = userEvent.setup();
    vi.mocked(appointmentsApi.reviewAppointment)
      .mockRejectedValueOnce(new ApiError(400, 'Insufficient stock: GLV-1 at MAIN has 2 on hand'))
      .mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<AllAppointmentsPanel />);

    const row = (await screen.findByText('Gloves for new hires')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText('Insufficient stock: GLV-1 at MAIN has 2 on hand')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText('Failed to review appointment')).toBeInTheDocument();
  });

  it('cancels with confirmation, handling decline and failure', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    vi.mocked(appointmentsApi.cancelAppointment)
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(new ApiError(400, 'This appointment is already cancelled'))
      .mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<AllAppointmentsPanel />);
    await screen.findByText('Gloves for new hires');
    const cancel = () => screen.getAllByRole('button', { name: 'Cancel' })[0];

    confirm.mockReturnValueOnce(false);
    await user.click(cancel());
    expect(appointmentsApi.cancelAppointment).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(cancel());
    await waitFor(() => expect(vi.mocked(appointmentsApi.cancelAppointment).mock.calls[0][0]).toBe('appt-1'));
    expect(await screen.findByText('Appointment cancelled')).toBeInTheDocument();

    await user.click(cancel());
    expect(await screen.findByText('This appointment is already cancelled')).toBeInTheDocument();
    await user.click(cancel());
    expect(await screen.findByText('Failed to cancel appointment')).toBeInTheDocument();
  });
});
