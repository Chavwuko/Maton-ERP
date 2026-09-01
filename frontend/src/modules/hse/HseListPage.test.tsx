import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hseApi from '../../api/hse';
import { HseListPage } from './HseListPage';

vi.mock('../../api/hse');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleIncidents = [
  {
    id: 'inc-1',
    organizationId: 'org-1',
    projectId: null,
    assetId: null,
    title: 'Slip near loading dock',
    description: null,
    type: 'NEAR_MISS' as const,
    severity: 'LOW' as const,
    status: 'REPORTED' as const,
    occurredAt: '2026-01-01T00:00:00.000Z',
    location: null,
    reportedById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('HseListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the incidents returned by the API', async () => {
    vi.mocked(hseApi.listIncidents).mockResolvedValue(sampleIncidents);

    renderWithProviders(<HseListPage />);

    expect(await screen.findByText('Slip near loading dock')).toBeInTheDocument();
  });

  it('shows an empty state when there are no incidents', async () => {
    vi.mocked(hseApi.listIncidents).mockResolvedValue([]);

    renderWithProviders(<HseListPage />);

    expect(await screen.findByText('No incidents reported yet.')).toBeInTheDocument();
  });

  it('shows "Report incident" for every role — creating an incident has no RBAC gate', async () => {
    vi.mocked(hseApi.listIncidents).mockResolvedValue([]);

    setCurrentRole('finance');
    renderWithProviders(<HseListPage />);
    await screen.findByText('No incidents reported yet.');

    expect(screen.getByRole('button', { name: 'Report incident' })).toBeInTheDocument();
  });

  it('reports an incident and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(hseApi.listIncidents).mockResolvedValue([]);
    vi.mocked(hseApi.createIncident).mockResolvedValue({ ...sampleIncidents[0], id: 'inc-2' });

    renderWithProviders(<HseListPage />);
    await screen.findByText('No incidents reported yet.');

    await user.click(screen.getByRole('button', { name: 'Report incident' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Title', { exact: false }), 'Spill in bay 2');
    await user.type(screen.getByLabelText('Occurred at', { exact: false }), '2026-01-15T10:30');
    await user.click(screen.getByRole('button', { name: 'Report' }));

    await waitFor(() => {
      expect(vi.mocked(hseApi.createIncident).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        title: 'Spill in bay 2',
      });
    });
    expect(await screen.findByText('Incident reported')).toBeInTheDocument();
  });
});
