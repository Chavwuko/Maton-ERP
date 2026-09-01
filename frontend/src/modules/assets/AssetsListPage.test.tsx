import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as assetsApi from '../../api/assets';
import { AssetsListPage } from './AssetsListPage';

vi.mock('../../api/assets');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleAssets = [
  {
    id: 'asset-1',
    organizationId: 'org-1',
    projectId: null,
    assetTag: 'PUMP-001',
    name: 'Feed Pump A',
    category: 'Rotating',
    status: 'ACTIVE' as const,
    location: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('AssetsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the assets returned by the API', async () => {
    vi.mocked(assetsApi.listAssets).mockResolvedValue(sampleAssets);

    renderWithProviders(<AssetsListPage />);

    expect(await screen.findByText('PUMP-001')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows an empty state when there are no assets', async () => {
    vi.mocked(assetsApi.listAssets).mockResolvedValue([]);

    renderWithProviders(<AssetsListPage />);

    expect(await screen.findByText('No assets yet.')).toBeInTheDocument();
  });

  it('shows "New asset" for admin/maintenance but not for a non-manager role', async () => {
    vi.mocked(assetsApi.listAssets).mockResolvedValue([]);

    setCurrentRole('finance');
    renderWithProviders(<AssetsListPage />);
    await screen.findByText('No assets yet.');

    expect(screen.queryByRole('button', { name: 'New asset' })).not.toBeInTheDocument();
  });

  it('creates an asset and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(assetsApi.listAssets).mockResolvedValue([]);
    vi.mocked(assetsApi.createAsset).mockResolvedValue({ ...sampleAssets[0], id: 'asset-2', assetTag: 'GEN-002' });

    renderWithProviders(<AssetsListPage />);
    await screen.findByText('No assets yet.');

    await user.click(screen.getByRole('button', { name: 'New asset' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Asset tag', { exact: false }), 'GEN-002');
    await user.type(screen.getByLabelText('Name', { exact: false }), 'Backup Generator');
    await user.type(screen.getByLabelText('Category', { exact: false }), 'Electrical');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(assetsApi.createAsset).toHaveBeenCalledWith({
        organizationId: 'org-1',
        assetTag: 'GEN-002',
        name: 'Backup Generator',
        category: 'Electrical',
        location: undefined,
      });
    });
    expect(await screen.findByText('Asset created')).toBeInTheDocument();
  });
});
