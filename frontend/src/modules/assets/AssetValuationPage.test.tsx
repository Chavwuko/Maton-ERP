import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { fireDate } from '../../test/fireDate';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { saveTextFile } from '../../lib/saveFile';
import { ApiError } from '../../api/client';
import * as assetsApi from '../../api/assets';
import type { ValuationReport } from './types';
import { AssetValuationPage } from './AssetValuationPage';

vi.mock('../../api/assets');
vi.mock('../../lib/saveFile', () => ({ saveTextFile: vi.fn() }));
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme', createdAt: '' }]),
}));

const report = (overrides: Partial<ValuationReport> = {}): ValuationReport => ({
  asOf: '2027-01-15',
  rows: [
    {
      id: 'a1', assetTag: 'PUMP-1', name: 'Pump', category: 'Rotating', status: 'ACTIVE', purchaseDate: '2026-01-15T00:00:00.000Z',
      method: 'STRAIGHT_LINE', cost: '12000.00', accumulatedDepreciation: '2000.00', bookValue: '10000.00', monthsElapsed: 12, fullyDepreciated: false,
    },
    {
      id: 'a2', assetTag: 'OLD-1', name: 'Old press', category: 'Rotating', status: 'ACTIVE', purchaseDate: null,
      method: 'DECLINING_BALANCE', cost: '500.00', accumulatedDepreciation: '500.00', bookValue: '0.00', monthsElapsed: 60, fullyDepreciated: true,
    },
    {
      id: 'a3', assetTag: 'NEW-1', name: 'Unpriced', category: 'Vehicles', status: 'UNDER_MAINTENANCE', purchaseDate: null,
      method: 'NONE', cost: null, accumulatedDepreciation: null, bookValue: null, monthsElapsed: 0, fullyDepreciated: false,
    },
  ],
  totals: {
    count: 2,
    cost: '12500.00',
    accumulatedDepreciation: '2500.00',
    bookValue: '10000.00',
    notValued: 1,
    byCategory: [{ category: 'Rotating', count: 2, cost: '12500.00', accumulatedDepreciation: '2500.00', bookValue: '10000.00' }],
  },
  ...overrides,
});

describe('AssetValuationPage', () => {
  beforeEach(() => {
    setCurrentRole('finance');
    vi.mocked(assetsApi.getValuationReport).mockResolvedValue(report());
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the totals, the categories and every asset', async () => {
    renderWithProviders(<AssetValuationPage />);

    expect(await screen.findByText('Assets valued')).toBeInTheDocument();
    expect(screen.getByText('12,500.00', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('2,500.00', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('10,000.00', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(`Book values as at ${new Date(2027, 0, 15).toLocaleDateString()}.`)).toBeInTheDocument();

    const [byCategory, every] = screen.getAllByRole('table');
    expect(within(byCategory).getByText('Rotating')).toBeInTheDocument();
    expect(within(every).getByRole('link', { name: 'PUMP-1 — Pump' })).toHaveAttribute('href', '/assets/a1');
    expect(within(every).getByText('Straight line')).toBeInTheDocument();
    expect(within(every).getByText('Fully depreciated')).toBeInTheDocument();
    expect(within(every).getByText('UNDER MAINTENANCE')).toBeInTheDocument();
  });

  it('flags the assets it could not value, with the right wording for one or several', async () => {
    renderWithProviders(<AssetValuationPage />);
    expect(await screen.findByText('1 asset has no purchase cost, so it is not valued.')).toBeInTheDocument();
    expect(within(screen.getAllByRole('table')[1]).getAllByText('—').length).toBeGreaterThanOrEqual(3);

    vi.mocked(assetsApi.getValuationReport).mockResolvedValue(report({ totals: { ...report().totals, notValued: 3 } }));
    renderWithProviders(<AssetValuationPage />);
    expect(await screen.findByText('3 assets have no purchase cost, so they are not valued.')).toBeInTheDocument();
  });

  it('says so when there is nothing to value', async () => {
    vi.mocked(assetsApi.getValuationReport).mockResolvedValue(
      report({ rows: [], totals: { count: 0, cost: '0', accumulatedDepreciation: '0', bookValue: '0', notValued: 0, byCategory: [] } }),
    );

    renderWithProviders(<AssetValuationPage />);

    expect(await screen.findByText('Nothing to value yet.')).toBeInTheDocument();
    expect(screen.getByText('No assets.')).toBeInTheDocument();
    expect(screen.queryByText(/has no purchase cost/)).not.toBeInTheDocument();
  });

  it('values the register again for another day, organization or with decommissioned assets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssetValuationPage />);
    await screen.findByText('Assets valued');
    expect(assetsApi.getValuationReport).toHaveBeenLastCalledWith({ organizationId: undefined, asOf: undefined, includeDecommissioned: false });

    fireDate(screen.getByLabelText('Value as at'), '2028-06-30');
    await waitFor(() => expect(assetsApi.getValuationReport).toHaveBeenLastCalledWith(expect.objectContaining({ asOf: '2028-06-30' })));

    await user.click(screen.getByLabelText('Include decommissioned'));
    await waitFor(() => expect(assetsApi.getValuationReport).toHaveBeenLastCalledWith(expect.objectContaining({ includeDecommissioned: true })));

    const organization = screen.getAllByLabelText('Organization').find((el) => el.tagName === 'INPUT')!;
    await pickOption(user, organization, 'Acme');
    await waitFor(() => expect(assetsApi.getValuationReport).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: 'org-1' })));
  });

  it('surfaces a failure', async () => {
    vi.mocked(assetsApi.getValuationReport).mockRejectedValue(new ApiError(500, 'Server error'));

    renderWithProviders(<AssetValuationPage />);

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('is not shown to the staff role, and not even asked for', async () => {
    setCurrentRole('staff');

    renderWithProviders(<AssetValuationPage />);

    expect(screen.getByText('Asset values are not shown to your role.')).toBeInTheDocument();
    expect(assetsApi.getValuationReport).not.toHaveBeenCalled();
  });

  it('downloads the valuation for the day, organization and filter on screen', async () => {
    const user = userEvent.setup();
    vi.mocked(assetsApi.downloadValuationExport).mockResolvedValue({ filename: 'asset-valuation-2028-06-30.csv', text: 'a,b' });
    renderWithProviders(<AssetValuationPage />);
    await screen.findByText('Assets valued');

    fireDate(screen.getByLabelText('Value as at'), '2028-06-30');
    await user.click(screen.getByLabelText('Include decommissioned'));
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(saveTextFile).toHaveBeenCalledWith('asset-valuation-2028-06-30.csv', 'a,b'));
    expect(vi.mocked(assetsApi.downloadValuationExport).mock.calls[0][0]).toEqual({
      organizationId: undefined,
      asOf: '2028-06-30',
      includeDecommissioned: true,
    });
  });
});
