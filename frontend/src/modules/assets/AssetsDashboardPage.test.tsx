import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pickOption } from '../../test/pickOption';
import { ApiError } from '../../api/client';
import * as assetsApi from '../../api/assets';
import type { AssetDashboard } from './types';
import { AssetsDashboardPage } from './AssetsDashboardPage';

vi.mock('../../api/assets');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme', createdAt: '' }]),
}));

const dashboard = (overrides: Partial<AssetDashboard> = {}): AssetDashboard => ({
  asOf: '2026-10-27',
  assetCount: 12,
  byStatus: [{ label: 'ACTIVE', count: 9 }, { label: 'UNDER_MAINTENANCE', count: 3 }],
  byCondition: [{ label: 'GOOD', count: 8 }],
  checkedOut: 4,
  overdueReturns: {
    count: 2,
    items: [
      {
        id: 'asg-1', expectedReturn: '2026-10-20T00:00:00.000Z', asset: { id: 'a1', assetTag: 'PUMP-1', name: 'Pump' },
        assignee: { firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' }, department: null,
      },
      {
        id: 'asg-2', expectedReturn: '2026-10-22T00:00:00.000Z', asset: { id: 'a2', assetTag: 'DRILL-1', name: 'Drill' },
        assignee: null, department: { name: 'Workshop' },
      },
      {
        id: 'asg-3', expectedReturn: '2026-10-23T00:00:00.000Z', asset: { id: 'a3', assetTag: 'SAW-1', name: 'Saw' },
        assignee: { firstName: '', lastName: '', email: 'nameless@acme.test' }, department: null,
      },
    ],
  },
  warrantyExpiring: { count: 1, items: [{ id: 'a4', assetTag: 'FAN-1', name: 'Fan', warrantyExpiry: '2026-11-20T00:00:00.000Z' }] },
  maintenance: { openWorkOrders: 5, overdueSchedules: 2, dueSoonSchedules: 3 },
  totals: { bookValue: '45913.23', notValued: 1 },
  ...overrides,
});

describe('AssetsDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(assetsApi.getAssetDashboard).mockResolvedValue(dashboard());
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the headline numbers, including what the register is worth', async () => {
    renderWithProviders(<AssetsDashboardPage />);

    expect(await screen.findByText('Open work orders')).toBeInTheDocument();
    const card = (label: string) => screen.getByText(label).previousElementSibling as HTMLElement;
    expect(card('Assets')).toHaveTextContent('12');
    expect(card('Checked out')).toHaveTextContent('4');
    expect(card('Open work orders')).toHaveTextContent('5');
    expect(card('Book value')).toHaveTextContent('45,913.23');
    expect(card('Maintenance overdue')).toHaveTextContent('2');
    expect(card('Maintenance due soon')).toHaveTextContent('3');
    expect(card('Returns overdue')).toHaveTextContent('2');
    expect(card('Warranties ending in 60 days')).toHaveTextContent('1');
    expect(screen.getByText('1 asset has no purchase cost and is not in the book value.')).toBeInTheDocument();
    expect(screen.getByText('By status')).toBeInTheDocument();
    expect(screen.getByText('By condition (in service)')).toBeInTheDocument();
  });

  it('lists the overdue returns and the warranties ending soon', async () => {
    renderWithProviders(<AssetsDashboardPage />);

    const [overdue, warranties] = await waitFor(() => {
      const tables = screen.getAllByRole('table');
      if (tables.length < 2) throw new Error('tables not rendered yet');
      return tables;
    });
    expect(within(overdue).getByRole('link', { name: 'PUMP-1 — Pump' })).toHaveAttribute('href', '/assets/a1');
    expect(within(overdue).getByText('Ann Store')).toBeInTheDocument();
    expect(within(overdue).getByText('Workshop')).toBeInTheDocument();
    expect(within(overdue).getByText('nameless@acme.test')).toBeInTheDocument();
    expect(within(overdue).getByText(new Date(2026, 9, 20).toLocaleDateString())).toBeInTheDocument();
    expect(within(warranties).getByRole('link', { name: 'FAN-1 — Fan' })).toHaveAttribute('href', '/assets/a4');
    expect(within(warranties).getByText(new Date(2026, 10, 20).toLocaleDateString())).toBeInTheDocument();
  });

  it('says so when nothing needs attention, and uses the plural for several unvalued assets', async () => {
    vi.mocked(assetsApi.getAssetDashboard).mockResolvedValue(
      dashboard({
        overdueReturns: { count: 0, items: [] },
        warrantyExpiring: { count: 0, items: [] },
        totals: { bookValue: '0', notValued: 3 },
      }),
    );

    renderWithProviders(<AssetsDashboardPage />);

    expect(await screen.findByText('Nothing is overdue.')).toBeInTheDocument();
    expect(screen.getByText('No warranties end in the next 60 days.')).toBeInTheDocument();
    expect(screen.getByText('3 assets have no purchase cost and are not in the book value.')).toBeInTheDocument();
  });

  it('leaves the money out for people who are not given it', async () => {
    vi.mocked(assetsApi.getAssetDashboard).mockResolvedValue(dashboard({ totals: { notValued: 1 } }));

    renderWithProviders(<AssetsDashboardPage />);

    await screen.findByText('Open work orders');
    expect(screen.queryByText('Book value')).not.toBeInTheDocument();
    expect(screen.queryByText(/no purchase cost/)).not.toBeInTheDocument();
  });

  it('shows one organization when chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssetsDashboardPage />);
    await screen.findByText('Open work orders');
    expect(assetsApi.getAssetDashboard).toHaveBeenLastCalledWith(undefined);

    const organization = screen.getAllByLabelText('Organization').find((el) => el.tagName === 'INPUT')!;
    await pickOption(user, organization, 'Acme');

    await waitFor(() => expect(assetsApi.getAssetDashboard).toHaveBeenLastCalledWith('org-1'));
  });

  it('surfaces a failure', async () => {
    vi.mocked(assetsApi.getAssetDashboard).mockRejectedValue(new ApiError(500, 'Server error'));

    renderWithProviders(<AssetsDashboardPage />);

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('copes with an unknown error', async () => {
    vi.mocked(assetsApi.getAssetDashboard).mockRejectedValue(new Error('network'));

    renderWithProviders(<AssetsDashboardPage />);

    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
