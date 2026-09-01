import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hseApi from '../../api/hse';
import { HseDetailPage } from './HseDetailPage';
import type { Incident } from './types';

vi.mock('../../api/hse');
vi.mock('../../api/users', () => ({
  listUsers: vi.fn().mockResolvedValue([
    { id: 'user-2', email: 'jane@acme.test', firstName: 'Jane', lastName: 'Doe', isActive: true, role: null },
  ]),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'inc-1' }) };
});

const baseIncident: Incident = {
  id: 'inc-1',
  organizationId: 'org-1',
  projectId: null,
  assetId: null,
  title: 'Slip near loading dock',
  description: null,
  type: 'NEAR_MISS',
  severity: 'LOW',
  status: 'REPORTED',
  occurredAt: '2026-01-01T00:00:00.000Z',
  location: null,
  reportedById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  correctiveActions: [],
};

describe('HseDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('offers only the legal next statuses for REPORTED', async () => {
    const user = userEvent.setup();
    vi.mocked(hseApi.getIncident).mockResolvedValue(baseIncident);

    renderWithProviders(<HseDetailPage />);
    await screen.findByText('Slip near loading dock');

    await user.click(screen.getByRole('button', { name: /REPORTED/i }));

    expect(await screen.findByText('Move to UNDER INVESTIGATION')).toBeInTheDocument();
    expect(screen.getByText('Move to CLOSED')).toBeInTheDocument();
    expect(screen.queryByText('Move to CORRECTIVE ACTION')).not.toBeInTheDocument();
  });

  it('hides the status menu for a non-manager role', async () => {
    setCurrentRole('finance');
    vi.mocked(hseApi.getIncident).mockResolvedValue(baseIncident);

    renderWithProviders(<HseDetailPage />);
    await screen.findByText('Slip near loading dock');

    expect(screen.queryByRole('button', { name: /REPORTED/i })).not.toBeInTheDocument();
    expect(screen.getByText('REPORTED')).toBeInTheDocument();
  });

  it('picking a transition calls updateIncidentStatus with the chosen status', async () => {
    const user = userEvent.setup();
    vi.mocked(hseApi.getIncident).mockResolvedValue(baseIncident);
    vi.mocked(hseApi.updateIncidentStatus).mockResolvedValue({ ...baseIncident, status: 'CLOSED' });

    renderWithProviders(<HseDetailPage />);
    await screen.findByText('Slip near loading dock');

    await user.click(screen.getByRole('button', { name: /REPORTED/i }));
    await user.click(await screen.findByText('Move to CLOSED'));

    await waitFor(() => {
      expect(hseApi.updateIncidentStatus).toHaveBeenCalledWith('inc-1', 'CLOSED');
    });
    expect(await screen.findByText('Status updated')).toBeInTheDocument();
  });

  it('creates a corrective action', async () => {
    const user = userEvent.setup();
    vi.mocked(hseApi.getIncident).mockResolvedValue(baseIncident);
    vi.mocked(hseApi.createCorrectiveAction).mockResolvedValue({
      id: 'ca-1',
      incidentId: 'inc-1',
      description: 'Add non-slip mat',
      assignedToId: 'user-2',
      dueDate: '2026-02-01T00:00:00.000Z',
      status: 'PENDING',
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithProviders(<HseDetailPage />);
    await screen.findByText('Slip near loading dock');

    await user.click(screen.getByRole('button', { name: 'New corrective action' }));
    await user.type(await screen.findByLabelText('Description', { exact: false }), 'Add non-slip mat');
    await user.click(await screen.findByPlaceholderText('Select user'));
    await user.click(await screen.findByText('Jane Doe (jane@acme.test)'));
    await user.type(screen.getByLabelText('Due date', { exact: false }), '2026-02-01');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(hseApi.createCorrectiveAction).toHaveBeenCalledWith(
        'inc-1',
        expect.objectContaining({ description: 'Add non-slip mat', assignedToId: 'user-2' }),
      );
    });
    expect(await screen.findByText('Corrective action created')).toBeInTheDocument();
  });
});
