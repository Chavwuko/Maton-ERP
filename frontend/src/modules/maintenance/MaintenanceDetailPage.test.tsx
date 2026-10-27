import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as maintenanceApi from '../../api/maintenance';
import { MaintenanceDetailPage } from './MaintenanceDetailPage';
import type { WorkOrder } from './types';

vi.mock('../../api/maintenance');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'wo-1' }) };
});

const baseWorkOrder: WorkOrder = {
  id: 'wo-1',
  organizationId: 'org-1',
  assetId: 'asset-1',
  title: 'Replace bearing',
  description: null,
  type: 'CORRECTIVE',
  priority: 'MEDIUM',
  status: 'OPEN',
  requestedById: 'user-1',
  assignedToId: null,
  dueDate: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('MaintenanceDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('offers only the legal next statuses for OPEN', async () => {
    const user = userEvent.setup();
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(baseWorkOrder);

    renderWithProviders(<MaintenanceDetailPage />);
    await screen.findByText('Replace bearing');

    await user.click(screen.getByRole('button', { name: /OPEN/i }));

    // Mantine's Menu dropdown mounts asynchronously, same as its Modal.
    expect(await screen.findByText('Move to IN PROGRESS')).toBeInTheDocument();
    expect(screen.getByText('Move to ON HOLD')).toBeInTheDocument();
    expect(screen.getByText('Move to CANCELLED')).toBeInTheDocument();
    expect(screen.queryByText('Move to COMPLETED')).not.toBeInTheDocument();
  });

  it('shows a plain badge (no menu) for a terminal status', async () => {
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue({ ...baseWorkOrder, status: 'COMPLETED' });

    renderWithProviders(<MaintenanceDetailPage />);
    await screen.findByText('Replace bearing');

    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /COMPLETED/i })).not.toBeInTheDocument();
  });

  it('picking a transition calls updateWorkOrderStatus with the chosen status', async () => {
    const user = userEvent.setup();
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(baseWorkOrder);
    vi.mocked(maintenanceApi.updateWorkOrderStatus).mockResolvedValue({ ...baseWorkOrder, status: 'ON_HOLD' });

    renderWithProviders(<MaintenanceDetailPage />);
    await screen.findByText('Replace bearing');

    await user.click(screen.getByRole('button', { name: /OPEN/i }));
    await user.click(await screen.findByText('Move to ON HOLD'));

    await waitFor(() => {
      expect(maintenanceApi.updateWorkOrderStatus).toHaveBeenCalledWith('wo-1', 'ON_HOLD');
    });
    expect(await screen.findByText('Status updated')).toBeInTheDocument();
  });

  it('does not show the status menu for a non-manager role', async () => {
    setCurrentRole('finance');
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(baseWorkOrder);

    renderWithProviders(<MaintenanceDetailPage />);
    await screen.findByText('Replace bearing');

    expect(screen.queryByRole('button', { name: /OPEN/i })).not.toBeInTheDocument();
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.queryByText('Reassign')).not.toBeInTheDocument();
  });

  describe('completing', () => {
    const inProgress = { ...baseWorkOrder, status: 'IN_PROGRESS' as const };

    const startCompleting = async (user: ReturnType<typeof userEvent.setup>) => {
      await screen.findByText('Replace bearing');
      await user.click(screen.getByRole('button', { name: /IN PROGRESS/i }));
      await user.click(await screen.findByText('Move to COMPLETED'));
      return screen.findByRole('dialog', { name: 'Complete work order' });
    };

    it('asks what was done and what it cost before completing', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(inProgress);
      vi.mocked(maintenanceApi.updateWorkOrderStatus).mockResolvedValue({ ...inProgress, status: 'COMPLETED' });
      renderWithProviders(<MaintenanceDetailPage />);

      const dialog = await startCompleting(user);
      expect(maintenanceApi.updateWorkOrderStatus).not.toHaveBeenCalled();
      await user.type(within(dialog).getByLabelText('What was done'), ' Replaced the seal ');
      await user.type(within(dialog).getByLabelText('Cost'), '125.5');
      await user.click(within(dialog).getByRole('button', { name: 'Complete' }));

      await waitFor(() => {
        expect(maintenanceApi.updateWorkOrderStatus).toHaveBeenCalledWith('wo-1', 'COMPLETED', {
          completionNotes: 'Replaced the seal',
          cost: 125.5,
        });
      });
      expect(await screen.findByText('Status updated')).toBeInTheDocument();
    });

    it('lets them complete without either', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(inProgress);
      vi.mocked(maintenanceApi.updateWorkOrderStatus).mockResolvedValue({ ...inProgress, status: 'COMPLETED' });
      renderWithProviders(<MaintenanceDetailPage />);

      const dialog = await startCompleting(user);
      await user.click(within(dialog).getByRole('button', { name: 'Complete' }));

      await waitFor(() => {
        expect(maintenanceApi.updateWorkOrderStatus).toHaveBeenCalledWith('wo-1', 'COMPLETED', { completionNotes: undefined, cost: undefined });
      });
    });

    it('surfaces an error from the server', async () => {
      const user = userEvent.setup();
      vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(inProgress);
      vi.mocked(maintenanceApi.updateWorkOrderStatus).mockRejectedValueOnce(new ApiError(400, 'cost must be zero or more'));
      renderWithProviders(<MaintenanceDetailPage />);

      const dialog = await startCompleting(user);
      await user.click(within(dialog).getByRole('button', { name: 'Complete' }));

      expect(await screen.findByText('cost must be zero or more')).toBeInTheDocument();
    });
  });

  it('shows what was done and what it cost once completed', async () => {
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue({
      ...baseWorkOrder,
      status: 'COMPLETED',
      completionNotes: 'Replaced the seal',
      cost: '125.50',
    });

    renderWithProviders(<MaintenanceDetailPage />);

    expect(await screen.findByText('Replaced the seal')).toBeInTheDocument();
    expect(screen.getByText('125.50')).toBeInTheDocument();
  });

  it('shows dashes when a completed one has neither', async () => {
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue({ ...baseWorkOrder, status: 'COMPLETED', completionNotes: null, cost: null });

    renderWithProviders(<MaintenanceDetailPage />);

    await screen.findByText('What was done');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('links to the asset, and says when a schedule opened it', async () => {
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue({ ...baseWorkOrder, type: 'PREVENTIVE', scheduleId: 'sch-1' });

    renderWithProviders(<MaintenanceDetailPage />);

    expect(await screen.findByRole('link', { name: 'View asset' })).toHaveAttribute('href', '/assets/asset-1');
    expect(screen.getByText('From a schedule')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'From a schedule' })).toHaveAttribute('href', '/maintenance/schedules');
  });

  it('says nothing about schedules for an ordinary work order', async () => {
    vi.mocked(maintenanceApi.getWorkOrder).mockResolvedValue(baseWorkOrder);

    renderWithProviders(<MaintenanceDetailPage />);

    await screen.findByText('Replace bearing');
    expect(screen.queryByText('From a schedule')).not.toBeInTheDocument();
  });
});
