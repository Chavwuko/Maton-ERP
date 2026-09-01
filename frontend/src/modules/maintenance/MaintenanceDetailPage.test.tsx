import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
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
});
