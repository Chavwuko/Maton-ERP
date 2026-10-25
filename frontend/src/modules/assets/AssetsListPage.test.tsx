import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAsset, makeAssignment } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as assetsApi from '../../api/assets';
import { AssetsListPage } from './AssetsListPage';

vi.mock('../../api/assets');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
  listDepartments: vi.fn().mockResolvedValue([{ id: 'dept-1', organizationId: 'org-1', name: 'Plant', code: 'PLT', createdAt: '' }]),
}));
vi.mock('../../api/accounting', () => ({
  listVendors: vi.fn().mockResolvedValue([{ id: 'ven-1', name: 'Apex Supplies' }]),
}));

const pump = makeAsset();
const lathe = makeAsset({
  id: 'asset-2',
  assetTag: 'LATHE-7',
  name: 'Lathe',
  status: 'UNDER_MAINTENANCE',
  condition: 'POOR',
  serialNumber: null,
  location: null,
  currentAssignment: makeAssignment(),
});

describe('AssetsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(assetsApi.listAssets).mockResolvedValue([pump, lathe]);
    vi.mocked(assetsApi.listMyAssets).mockResolvedValue([lathe]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the assets with status, condition and who holds them', async () => {
    renderWithProviders(<AssetsListPage />);

    expect(await screen.findByText('PUMP-001')).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('ACTIVE')).toBeInTheDocument();
    expect(table.getByText('UNDER MAINTENANCE')).toBeInTheDocument();
    expect(table.getByText('GOOD')).toBeInTheDocument();
    expect(table.getByText('POOR')).toBeInTheDocument();
    expect(table.getByText('Ann Store')).toBeInTheDocument();
    expect(table.getByText('Bay 3')).toBeInTheDocument();
  });

  it('shows empty and error states', async () => {
    vi.mocked(assetsApi.listAssets).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<AssetsListPage />);
    expect(await screen.findByText('No assets yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(assetsApi.listAssets).mockRejectedValueOnce(new ApiError(500, 'Server down'));
    const second = renderWithProviders(<AssetsListPage />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
    second.unmount();

    vi.mocked(assetsApi.listAssets).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<AssetsListPage />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('shows "New asset" for admin/maintenance but not for a non-manager role', async () => {
    setCurrentRole('finance');
    renderWithProviders(<AssetsListPage />);
    await screen.findByText('PUMP-001');

    expect(screen.queryByRole('button', { name: 'New asset' })).not.toBeInTheDocument();
  });

  describe('filters', () => {
    it('search the server by text, status and condition', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AssetsListPage />);
      await screen.findByText('PUMP-001');

      await user.type(screen.getByLabelText('Search'), 'pump');
      await pickOption(user, screen.getByPlaceholderText('All statuses'), 'ACTIVE');
      await pickOption(user, screen.getByPlaceholderText('Any condition'), 'GOOD');

      await waitFor(() => {
        expect(vi.mocked(assetsApi.listAssets)).toHaveBeenLastCalledWith({ search: 'pump', status: 'ACTIVE', condition: 'GOOD' });
      });
    });

    it('say so when nothing matches', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.listAssets).mockImplementation(async (filters) => (filters?.search ? [] : [pump]));
      renderWithProviders(<AssetsListPage />);
      await screen.findByText('PUMP-001');

      await user.type(screen.getByLabelText('Search'), 'zzz');

      expect(await screen.findByText('No assets match.')).toBeInTheDocument();
    });

    it('"Assigned to me" lists only what I hold, still narrowed by the other filters', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.listMyAssets).mockResolvedValue([pump, lathe]);
      renderWithProviders(<AssetsListPage />);
      await screen.findByText('PUMP-001');

      await user.click(screen.getByRole('switch', { name: 'Assigned to me' }));
      await waitFor(() => expect(assetsApi.listMyAssets).toHaveBeenCalled());
      expect(await screen.findByText('LATHE-7')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Search'), 'sn-100');
      await waitFor(() => expect(screen.queryByText('LATHE-7')).not.toBeInTheDocument());
      expect(screen.getByText('PUMP-001')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Search'));
      await pickOption(user, screen.getByPlaceholderText('All statuses'), 'UNDER MAINTENANCE');
      await pickOption(user, screen.getByPlaceholderText('Any condition'), 'POOR');
      await waitFor(() => expect(screen.queryByText('PUMP-001')).not.toBeInTheDocument());
      expect(screen.getByText('LATHE-7')).toBeInTheDocument();
    });

    it('"Assigned to me" says so when I hold nothing', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.listMyAssets).mockResolvedValue([]);
      renderWithProviders(<AssetsListPage />);
      await screen.findByText('PUMP-001');

      await user.click(screen.getByRole('switch', { name: 'Assigned to me' }));

      expect(await screen.findByText('No assets match.')).toBeInTheDocument();
    });
  });

  describe('creating', () => {
    async function openForm(user: ReturnType<typeof userEvent.setup>) {
      renderWithProviders(<AssetsListPage />);
      await screen.findByText('PUMP-001');
      await user.click(screen.getByRole('button', { name: 'New asset' }));
      const dialog = await screen.findByRole('dialog', { name: 'New asset' });
      await pickOption(user, within(dialog).getByPlaceholderText('Select organization'), 'Acme Industrial');
      return dialog;
    }

    it('creates an asset with just the required fields', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.createAsset).mockResolvedValue(pump);
      const dialog = await openForm(user);

      await user.type(within(dialog).getByLabelText('Asset tag', { exact: false }), 'GEN-002');
      await user.type(within(dialog).getByLabelText('Name', { exact: false }), 'Backup Generator');
      await user.type(within(dialog).getByLabelText('Category', { exact: false }), 'Electrical');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.createAsset).mock.calls[0][0]).toEqual({
          organizationId: 'org-1',
          assetTag: 'GEN-002',
          name: 'Backup Generator',
          category: 'Electrical',
          condition: 'GOOD',
        });
      });
      expect(await screen.findByText('Asset created')).toBeInTheDocument();
    });

    it('sends the full record when it is filled in', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.createAsset).mockResolvedValue(pump);
      const dialog = await openForm(user);
      const fill = async (label: string, text: string) => {
        await user.click(within(dialog).getByLabelText(label, { exact: false }));
        await user.paste(text);
      };

      await fill('Asset tag', 'PMP-9');
      await fill('Name', 'Booster Pump');
      await fill('Category', 'Rotating');
      await pickOption(user, within(dialog).getByLabelText('Condition'), 'NEW');
      await fill('Location', 'Bay 1');
      await pickOption(user, within(dialog).getByPlaceholderText('Select department'), 'Plant');
      await fill('Make', 'Grundfos');
      await fill('Model', 'CR-45');
      await fill('Serial number', 'SN-9');
      await fill('Purchase date', '2026-01-15');
      await fill('Purchase cost', '1500.5');
      await pickOption(user, within(dialog).getByPlaceholderText('Select vendor'), 'Apex Supplies');
      await fill('Warranty expires', '2028-01-15');
      await fill('Notes', 'Needs a guard');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.createAsset).mock.calls[0][0]).toEqual({
          organizationId: 'org-1',
          assetTag: 'PMP-9',
          name: 'Booster Pump',
          category: 'Rotating',
          condition: 'NEW',
          location: 'Bay 1',
          departmentId: 'dept-1',
          make: 'Grundfos',
          model: 'CR-45',
          serialNumber: 'SN-9',
          purchaseDate: '2026-01-15',
          purchaseCost: 1500.5,
          vendorId: 'ven-1',
          warrantyExpiry: '2028-01-15',
          notes: 'Needs a guard',
        });
      });
    });

    it('checks the required fields and that the warranty is not before the purchase', async () => {
      const user = userEvent.setup();
      const dialog = await openForm(user);

      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await within(dialog).findByText('Asset tag is required')).toBeInTheDocument();
      expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
      expect(within(dialog).getByText('Category is required')).toBeInTheDocument();

      await user.click(within(dialog).getByLabelText('Purchase date'));
      await user.paste('2026-06-01');
      await user.click(within(dialog).getByLabelText('Warranty expires'));
      await user.paste('2026-01-01');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await within(dialog).findByText('The warranty cannot expire before the purchase date')).toBeInTheDocument();
      expect(assetsApi.createAsset).not.toHaveBeenCalled();
    });

    it('needs an organization', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AssetsListPage />);
      await screen.findByText('PUMP-001');
      await user.click(screen.getByRole('button', { name: 'New asset' }));
      const dialog = await screen.findByRole('dialog', { name: 'New asset' });

      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await within(dialog).findByText('Organization is required')).toBeInTheDocument();
    });

    it('surfaces an API error such as a duplicate serial number', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.createAsset)
        .mockRejectedValueOnce(new ApiError(409, 'Serial number "SN-9" is already used by another asset in this organization'))
        .mockRejectedValueOnce(new Error('network'));
      const dialog = await openForm(user);
      for (const [label, text] of [['Asset tag', 'A'], ['Name', 'B'], ['Category', 'C']]) {
        await user.click(within(dialog).getByLabelText(label, { exact: false }));
        await user.paste(text);
      }

      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await screen.findByText(/Serial number "SN-9" is already used/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await screen.findByText('Failed to create asset')).toBeInTheDocument();
    });
  });
});
