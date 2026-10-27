import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeSchedule, makeUser } from '../../test/fixtures';
import { fireDate } from '../../test/fireDate';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as maintenanceApi from '../../api/maintenance';
import * as assetsApi from '../../api/assets';
import * as usersApi from '../../api/users';
import { SchedulesPage } from './SchedulesPage';

vi.mock('../../api/maintenance');
vi.mock('../../api/assets');
vi.mock('../../api/users');

const overdue = makeSchedule({ id: 'sch-1', title: 'Grease bearings', dueStatus: 'OVERDUE', nextDueDate: '2026-10-01T00:00:00.000Z' });
const soon = makeSchedule({
  id: 'sch-2',
  title: 'Replace filter',
  dueStatus: 'DUE_SOON',
  intervalValue: 1,
  intervalUnit: 'WEEKS',
  basis: 'FLOATING',
  lastCompletedDate: null,
  assignedToId: 'u-tech',
  assignedTo: { id: 'u-tech', firstName: 'Tom', lastName: 'Tech', email: 'tom@acme.test' },
});
const paused = makeSchedule({ id: 'sch-3', title: 'Calibrate gauge', dueStatus: 'PAUSED', active: false });

// The select's closed listbox carries the same label as its input.
const showFilter = () => screen.getAllByLabelText('Show').find((el) => el.tagName === 'INPUT')!;

describe('SchedulesPage', () => {
  beforeEach(() => {
    setCurrentRole('maintenance');
    vi.mocked(maintenanceApi.listSchedules).mockResolvedValue([overdue, soon, paused]);
    vi.mocked(assetsApi.listAssets).mockResolvedValue([
      { id: 'asset-1', assetTag: 'PUMP-001', name: 'Feed Pump A' },
    ] as never);
    vi.mocked(usersApi.listUsers).mockResolvedValue([makeUser({ id: 'u-tech', firstName: 'Tom', lastName: 'Tech', email: 'tom@acme.test' })]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('lists every schedule with what it repeats, when it is next due, and where it stands', async () => {
    renderWithProviders(<SchedulesPage />);

    expect(await screen.findByText('Grease bearings')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Every 3 months')).toBeInTheDocument();
    expect(within(rows[1]).getByText('fixed calendar')).toBeInTheDocument();
    expect(within(rows[1]).getByText('OVERDUE')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Maintenance team')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: 'PUMP-001 — Feed Pump A' })).toHaveAttribute('href', '/assets/asset-1');
    expect(within(rows[2]).getByText('Every week')).toBeInTheDocument();
    expect(within(rows[2]).getByText('after each job')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Tom Tech')).toBeInTheDocument();
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
    expect(within(rows[3]).getByText('PAUSED')).toBeInTheDocument();
  });

  it('filters by where each one stands', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SchedulesPage />);
    await screen.findByText('Grease bearings');

    await pickOption(user, showFilter(), 'Overdue');
    expect(screen.getByText('Grease bearings')).toBeInTheDocument();
    expect(screen.queryByText('Replace filter')).not.toBeInTheDocument();

    await pickOption(user, showFilter(), 'Upcoming');
    expect(await screen.findByText('Nothing matches that filter.')).toBeInTheDocument();
  });

  it('says so when there are none, and surfaces a load failure', async () => {
    vi.mocked(maintenanceApi.listSchedules).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<SchedulesPage />);
    expect(await screen.findByText('No maintenance schedules yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(maintenanceApi.listSchedules).mockRejectedValueOnce(new ApiError(500, 'Server error'));
    renderWithProviders(<SchedulesPage />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('shows people who only look the list without the buttons', async () => {
    setCurrentRole('hse');
    renderWithProviders(<SchedulesPage />);

    await screen.findByText('Grease bearings');
    expect(screen.queryByRole('button', { name: 'New schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open due work orders' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
  });

  describe('opening the work orders that are due', () => {
    it('says how many were opened', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.generateDueWorkOrders)
        .mockResolvedValueOnce({ created: 1, workOrders: [] })
        .mockResolvedValueOnce({ created: 3, workOrders: [] })
        .mockResolvedValueOnce({ created: 0, workOrders: [] });
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Open due work orders' }));
      expect(await screen.findByText('1 work order opened')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Open due work orders' }));
      expect(await screen.findByText('3 work orders opened')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Open due work orders' }));
      expect(await screen.findByText('Nothing is due right now')).toBeInTheDocument();
    });

    it('surfaces a failure', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.generateDueWorkOrders).mockRejectedValueOnce(new Error('network'));
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Open due work orders' }));

      expect(await screen.findByText('Failed to open work orders')).toBeInTheDocument();
    });
  });

  describe('pausing and resuming', () => {
    it('pauses a running schedule and resumes a paused one', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.updateSchedule).mockResolvedValue(overdue);
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Pause Grease bearings' }));
      await waitFor(() => expect(maintenanceApi.updateSchedule).toHaveBeenCalledWith('sch-1', { active: false }));
      expect(await screen.findByText('Schedule paused')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Resume Calibrate gauge' }));
      await waitFor(() => expect(maintenanceApi.updateSchedule).toHaveBeenCalledWith('sch-3', { active: true }));
      expect(await screen.findByText('Schedule resumed')).toBeInTheDocument();
    });

    it('surfaces a failure', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.updateSchedule).mockRejectedValueOnce(new ApiError(404, 'Maintenance schedule sch-1 not found'));
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Pause Grease bearings' }));

      expect(await screen.findByText('Maintenance schedule sch-1 not found')).toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    it('is for admins only, and asks first', async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
      vi.mocked(maintenanceApi.deleteSchedule).mockResolvedValue({});
      setCurrentRole('admin');
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Delete Grease bearings' }));
      expect(maintenanceApi.deleteSchedule).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Delete Grease bearings' }));
      await waitFor(() => expect(vi.mocked(maintenanceApi.deleteSchedule).mock.calls[0][0]).toBe('sch-1'));
      expect(await screen.findByText('Schedule deleted')).toBeInTheDocument();
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Grease bearings'));
      confirm.mockRestore();
    });

    it('is not offered to maintenance', async () => {
      renderWithProviders(<SchedulesPage />);

      await screen.findByText('Grease bearings');
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    });

    it('surfaces a failure', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(maintenanceApi.deleteSchedule).mockRejectedValueOnce(new Error('network'));
      setCurrentRole('admin');
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Delete Grease bearings' }));

      expect(await screen.findByText('Failed to delete schedule')).toBeInTheDocument();
      vi.mocked(window.confirm).mockRestore();
    });
  });

  describe('planning and editing', () => {
    it('plans a new schedule', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.createSchedule).mockResolvedValue(overdue);
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'New schedule' }));
      const dialog = await screen.findByRole('dialog', { name: 'New maintenance schedule' });
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await within(dialog).findByText('Asset is required')).toBeInTheDocument();
      expect(within(dialog).getByText('Title is required')).toBeInTheDocument();
      expect(within(dialog).getByText('Date is required')).toBeInTheDocument();
      expect(maintenanceApi.createSchedule).not.toHaveBeenCalled();

      await pickOption(user, within(dialog).getByPlaceholderText('Select asset'), 'PUMP-001 — Feed Pump A');
      await user.type(within(dialog).getByLabelText(/Task/), '  Grease bearings ');
      await user.click(within(dialog).getByLabelText('Instructions'));
      await user.paste('Use the red grease');
      await user.clear(within(dialog).getByLabelText(/Repeat every/));
      await user.type(within(dialog).getByLabelText(/Repeat every/), '6');
      await pickOption(user, within(dialog).getByLabelText('Unit'), 'Weeks');
      await pickOption(user, within(dialog).getByLabelText('Counted from'), 'After each job');
      fireDate(within(dialog).getByLabelText(/First due/), '2026-12-01');
      await user.clear(within(dialog).getByLabelText(/days ahead/));
      await user.type(within(dialog).getByLabelText(/days ahead/), '14');
      await pickOption(user, within(dialog).getByLabelText('Priority'), 'HIGH');
      await pickOption(user, within(dialog).getByPlaceholderText('Select user'), 'Tom Tech (tom@acme.test)');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(vi.mocked(maintenanceApi.createSchedule).mock.calls[0][0]).toEqual({
          assetId: 'asset-1',
          title: 'Grease bearings',
          description: 'Use the red grease',
          intervalValue: 6,
          intervalUnit: 'WEEKS',
          basis: 'FLOATING',
          priority: 'HIGH',
          leadDays: 14,
          assignedToId: 'u-tech',
          firstDueDate: '2026-12-01',
        });
      });
      expect(await screen.findByText('Schedule created')).toBeInTheDocument();
    });

    it('rejects an interval or lead time that is not a whole number', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'New schedule' }));
      const dialog = await screen.findByRole('dialog');
      await user.clear(within(dialog).getByLabelText(/Repeat every/));
      await user.clear(within(dialog).getByLabelText(/days ahead/));
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await within(dialog).findByText('Enter a whole number, 1 or more')).toBeInTheDocument();
      expect(within(dialog).getByText('Enter a whole number, 0 or more')).toBeInTheDocument();
    });

    it('surfaces a failure', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.createSchedule)
        .mockRejectedValueOnce(new ApiError(400, 'Cannot schedule maintenance for a decommissioned asset'))
        .mockRejectedValueOnce(new Error('network'));
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'New schedule' }));
      const dialog = await screen.findByRole('dialog');
      await pickOption(user, within(dialog).getByPlaceholderText('Select asset'), 'PUMP-001 — Feed Pump A');
      await user.type(within(dialog).getByLabelText(/Task/), 'Grease');
      fireDate(within(dialog).getByLabelText(/First due/), '2026-12-01');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await screen.findByText('Cannot schedule maintenance for a decommissioned asset')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await screen.findByText('Failed to save schedule')).toBeInTheDocument();
    });

    it('edits an existing one from its current values, keeping the asset fixed', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.updateSchedule).mockResolvedValue(soon);
      renderWithProviders(<SchedulesPage />);

      await user.click(await screen.findByRole('button', { name: 'Edit Replace filter' }));
      const dialog = await screen.findByRole('dialog', { name: 'Edit Replace filter' });
      expect(within(dialog).getByLabelText(/Task/)).toHaveValue('Replace filter');
      expect(within(dialog).getByLabelText(/Repeat every/)).toHaveValue('1');
      expect(within(dialog).getByLabelText(/Next due/)).toHaveValue('2026-11-15');
      expect(within(dialog).getByPlaceholderText('Select asset')).toBeDisabled();

      await user.clear(within(dialog).getByLabelText(/Task/));
      await user.type(within(dialog).getByLabelText(/Task/), 'Replace oil filter');
      fireDate(within(dialog).getByLabelText(/Next due/), '2026-11-20');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(maintenanceApi.updateSchedule).toHaveBeenCalledWith('sch-2', {
          title: 'Replace oil filter',
          intervalValue: 1,
          intervalUnit: 'WEEKS',
          basis: 'FLOATING',
          priority: 'MEDIUM',
          leadDays: 7,
          description: null,
          assignedToId: 'u-tech',
          nextDueDate: '2026-11-20',
        });
      });
      expect(await screen.findByText('Schedule updated')).toBeInTheDocument();
    });
  });
});
