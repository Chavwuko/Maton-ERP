import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as hrApi from '../../api/hr';
import { ShiftsPanel } from './ShiftsPanel';

vi.mock('../../api/hr');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleShifts = [
  {
    id: 'shift-1',
    organizationId: 'org-1',
    name: 'Morning',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ShiftsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the shifts returned by the API', async () => {
    vi.mocked(hrApi.listShifts).mockResolvedValue(sampleShifts);

    renderWithProviders(<ShiftsPanel />);

    expect(await screen.findByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows an empty state when there are no shifts', async () => {
    vi.mocked(hrApi.listShifts).mockResolvedValue([]);

    renderWithProviders(<ShiftsPanel />);

    expect(await screen.findByText('No shifts yet.')).toBeInTheDocument();
  });

  it('creates a shift and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.listShifts).mockResolvedValue([]);
    vi.mocked(hrApi.createShift).mockResolvedValue(sampleShifts[0]);

    renderWithProviders(<ShiftsPanel />);
    await screen.findByText('No shifts yet.');

    await user.click(screen.getByRole('button', { name: 'New shift' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Name', { exact: false }), 'Morning');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(hrApi.createShift).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        name: 'Morning',
      });
    });
    expect(await screen.findByText('Shift created')).toBeInTheDocument();
  });
});
