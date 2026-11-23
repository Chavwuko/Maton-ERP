import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAsset } from '../../test/fixtures';
import { ApiError } from '../../api/client';
import * as assetsApi from '../../api/assets';
import { AssetLabelsPage } from './AssetLabelsPage';

vi.mock('../../api/assets');

const pump = makeAsset();
const lathe = makeAsset({ id: 'asset-2', assetTag: 'LATHE-7', name: 'Lathe' });
const old = makeAsset({ id: 'asset-3', assetTag: 'OLD-1', name: 'Old press', status: 'DECOMMISSIONED' });

describe('AssetLabelsPage', () => {
  beforeEach(() => {
    vi.mocked(assetsApi.listAssets).mockResolvedValue([pump, lathe, old]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('makes a label with a QR code for each asset picked', async () => {
    renderWithProviders(<AssetLabelsPage />, { route: '/assets/labels?ids=asset-1,asset-3' });

    const labels = await screen.findAllByTestId('asset-label');
    expect(labels).toHaveLength(2);
    expect(labels[0]).toHaveTextContent('PUMP-001');
    expect(labels[0]).toHaveTextContent('Feed Pump A');
    expect(labels[0].querySelector('svg')).not.toBeNull();
    expect(labels[1]).toHaveTextContent('OLD-1');
    expect(screen.getByRole('link', { name: 'Pick others on the register' })).toHaveAttribute('href', '/assets');
  });

  it('labels every asset still in service when none are picked', async () => {
    renderWithProviders(<AssetLabelsPage />);

    const labels = await screen.findAllByTestId('asset-label');
    expect(labels.map((label) => label.textContent)).toEqual([expect.stringContaining('PUMP-001'), expect.stringContaining('LATHE-7')]);
    expect(screen.getByText(/To print only some, tick them on the register/)).toBeInTheDocument();
  });

  it('prints the sheet', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderWithProviders(<AssetLabelsPage />, { route: '/assets/labels?ids=asset-1' });
    await screen.findByTestId('asset-label');

    await user.click(screen.getByRole('button', { name: 'Print' }));

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('has nothing to print, and no print button to press, for an unknown pick', async () => {
    renderWithProviders(<AssetLabelsPage />, { route: '/assets/labels?ids=nope' });

    expect(await screen.findByText('No assets to label.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('surfaces a failure', async () => {
    vi.mocked(assetsApi.listAssets).mockRejectedValueOnce(new ApiError(500, 'Server error')).mockRejectedValueOnce(new Error('network'));

    const { unmount } = renderWithProviders(<AssetLabelsPage />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    unmount();

    renderWithProviders(<AssetLabelsPage />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
