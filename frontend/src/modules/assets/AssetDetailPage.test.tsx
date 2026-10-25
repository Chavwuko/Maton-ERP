import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAsset, makeAssignment } from '../../test/fixtures';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as assetsApi from '../../api/assets';
import * as usersApi from '../../api/users';
import { AssetDetailPage } from './AssetDetailPage';

vi.mock('../../api/assets');
vi.mock('../../api/users');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'asset-1' }) };
});
vi.mock('../../api/organizations', () => ({
  listDepartments: vi.fn().mockResolvedValue([{ id: 'dept-1', organizationId: 'org-1', name: 'Plant', code: 'PLT', createdAt: '' }]),
}));
vi.mock('../../api/accounting', () => ({
  listVendors: vi.fn().mockResolvedValue([{ id: 'ven-1', name: 'Apex Supplies' }]),
}));

const out = makeAssignment({ notes: 'For the shutdown' });
const returned = makeAssignment({
  id: 'asg-0',
  assignedAt: '2026-09-01T09:00:00.000Z',
  returnedAt: '2026-09-30T09:00:00.000Z',
  conditionIn: 'FAIR',
  notes: 'Site pass',
  returnNotes: 'Scuffed',
  assignee: null,
  assigneeId: null,
  departmentId: 'dept-1',
  department: { id: 'dept-1', name: 'Plant' },
});

describe('AssetDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset());
    vi.mocked(assetsApi.listAssetAssignments).mockResolvedValue([]);
    vi.mocked(assetsApi.getAssetHistory).mockResolvedValue([]);
    vi.mocked(usersApi.listUsers).mockResolvedValue([
      { id: 'u-ann', email: 'ann@acme.test', firstName: 'Ann', lastName: 'Store', phone: null, isActive: true, status: 'ACTIVE', role: null, departmentId: null, department: null, requestedAt: null, rejectionReason: null, createdAt: '' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the whole record', async () => {
    renderWithProviders(<AssetDetailPage />);

    expect(await screen.findByRole('heading', { name: 'PUMP-001 — Feed Pump A' })).toBeInTheDocument();
    const details = within(screen.getAllByRole('table')[0]);
    expect(details.getByText('Grundfos CR-45')).toBeInTheDocument();
    expect(details.getByText('SN-100')).toBeInTheDocument();
    expect(details.getByText('1,500.50')).toBeInTheDocument();
    expect(details.getByText('Apex Supplies')).toBeInTheDocument();
    expect(details.getByText('Plant')).toBeInTheDocument();
    expect(details.getByText(new Date(2026, 0, 15).toLocaleDateString())).toBeInTheDocument();
    expect(screen.getByText('Not checked out.')).toBeInTheDocument();
    expect(screen.getByText('Never checked out.')).toBeInTheDocument();
    expect(screen.getByText('No changes recorded.')).toBeInTheDocument();
  });

  it('shows dashes for what is missing, and leaves out the cost when it is hidden from this role', async () => {
    setCurrentRole('staff');
    const bare = makeAsset({
      location: null, department: null, make: null, model: null, serialNumber: null, purchaseDate: null,
      vendor: null, warrantyExpiry: null, notes: null,
    });
    delete (bare as { purchaseCost?: string | null }).purchaseCost;
    vi.mocked(assetsApi.getAsset).mockResolvedValue(bare);

    renderWithProviders(<AssetDetailPage />);

    await screen.findByRole('heading', { name: 'PUMP-001 — Feed Pump A' });
    const details = within(screen.getAllByRole('table')[0]);
    expect(details.queryByText('Purchase cost')).not.toBeInTheDocument();
    expect(details.getAllByText('—').length).toBeGreaterThanOrEqual(8);
  });

  it('shows a purchase cost of nothing as a dash', async () => {
    vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ purchaseCost: null }));

    renderWithProviders(<AssetDetailPage />);

    await screen.findByText('Purchase cost');
    expect(within(screen.getAllByRole('table')[0]).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows who holds it, since when, and the custody history', async () => {
    vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ currentAssignment: out }));
    vi.mocked(assetsApi.listAssetAssignments).mockResolvedValue([out, returned]);

    renderWithProviders(<AssetDetailPage />);

    expect(await screen.findByText('Held by Ann Store')).toBeInTheDocument();
    expect(screen.getByText(/expected back/)).toBeInTheDocument();
    expect(screen.getAllByText('For the shutdown').length).toBeGreaterThan(0);
    const history = within(screen.getAllByRole('table')[1]);
    expect(history.getByText('Still out')).toBeInTheDocument();
    expect(history.getByText('GOOD → —')).toBeInTheDocument();
    expect(history.getByText('GOOD → FAIR')).toBeInTheDocument();
    expect(history.getByText('Plant')).toBeInTheDocument();
    expect(history.getByText('Site pass · Scuffed')).toBeInTheDocument();
  });

  it('lists the changes made, for people who manage assets', async () => {
    vi.mocked(assetsApi.getAssetHistory).mockResolvedValue([
      { id: 'l1', userId: 'u1', action: 'ASSET_UPDATE', entityType: 'Asset', entityId: 'asset-1', metadata: { summary: 'PUMP-001 Feed Pump A', method: 'PATCH', path: '/assets/asset-1' }, createdAt: '2026-10-20T10:00:00.000Z', user: { id: 'u1', firstName: 'Mo', lastName: 'Maint', email: 'm@acme.test' } },
      { id: 'l2', userId: null, action: 'ASSET_CREATE', entityType: 'Asset', entityId: 'asset-1', metadata: null, createdAt: '2026-10-19T10:00:00.000Z', user: null },
    ]);

    renderWithProviders(<AssetDetailPage />);

    expect(await screen.findByText('Mo Maint')).toBeInTheDocument();
    expect(screen.getByText('ASSET_UPDATE')).toBeInTheDocument();
    expect(screen.getByText('PUMP-001 Feed Pump A')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('keeps the buttons and the change history from people who only look', async () => {
    setCurrentRole('hse');
    renderWithProviders(<AssetDetailPage />);

    await screen.findByRole('heading', { name: 'PUMP-001 — Feed Pump A' });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
    expect(screen.queryByText('Change history')).not.toBeInTheDocument();
    expect(assetsApi.getAssetHistory).not.toHaveBeenCalled();
  });

  it('offers check-out only for an active asset nobody holds, and check-in when it is held', async () => {
    const { unmount } = renderWithProviders(<AssetDetailPage />);
    expect(await screen.findByRole('button', { name: 'Check out' })).toBeInTheDocument();
    unmount();

    vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ status: 'UNDER_MAINTENANCE' }));
    const second = renderWithProviders(<AssetDetailPage />);
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
    second.unmount();

    vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ currentAssignment: out }));
    renderWithProviders(<AssetDetailPage />);
    expect(await screen.findByRole('button', { name: 'Check in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
  });

  it('shows an error when the asset cannot be loaded', async () => {
    vi.mocked(assetsApi.getAsset).mockRejectedValueOnce(new ApiError(404, 'Asset asset-1 not found'));
    const { unmount } = renderWithProviders(<AssetDetailPage />);
    expect(await screen.findByText('Asset asset-1 not found')).toBeInTheDocument();
    unmount();

    vi.mocked(assetsApi.getAsset).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<AssetDetailPage />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  describe('editing', () => {
    it('pre-fills the form and saves changes, clearing fields that were emptied', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.updateAsset).mockResolvedValue(makeAsset());
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog', { name: 'Edit PUMP-001' });
      expect(within(dialog).getByLabelText('Serial number')).toHaveValue('SN-100');
      expect(within(dialog).getByLabelText('Purchase date')).toHaveValue('2026-01-15');
      expect(within(dialog).getByLabelText('Purchase cost')).toHaveValue('1,500.5');
      const notes = within(dialog).getByLabelText('Notes');
      await user.click(notes);
      await user.paste('Now with a guard');
      const make = within(dialog).getByLabelText('Make');
      await user.clear(make);
      await pickOption(user, within(dialog).getByLabelText('Condition'), 'FAIR');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.updateAsset).mock.calls[0]).toEqual([
          'asset-1',
          expect.objectContaining({
            assetTag: 'PUMP-001',
            name: 'Feed Pump A',
            category: 'Rotating',
            make: null,
            model: 'CR-45',
            serialNumber: 'SN-100',
            notes: 'Now with a guard',
            condition: 'FAIR',
            purchaseCost: 1500.5,
            vendorId: 'ven-1',
            departmentId: 'dept-1',
            status: 'ACTIVE',
          }),
        ]);
      });
      expect(await screen.findByText('Asset updated')).toBeInTheDocument();
    });

    it('can decommission', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.updateAsset).mockResolvedValue(makeAsset());
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog');
      await pickOption(user, within(dialog).getByLabelText('Status'), 'Decommissioned');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.updateAsset).mock.calls[0][1]).toMatchObject({ status: 'DECOMMISSIONED' });
      });
    });

    it('locks the status while the asset is under maintenance, and does not send it', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ status: 'UNDER_MAINTENANCE' }));
      vi.mocked(assetsApi.updateAsset).mockResolvedValue(makeAsset());
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Status')).toBeDisabled();
      expect(within(dialog).getByText(/Under maintenance: complete or cancel its work order/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(assetsApi.updateAsset).toHaveBeenCalled());
      expect(vi.mocked(assetsApi.updateAsset).mock.calls[0][1]).not.toHaveProperty('status');
    });

    it('shows a decommissioned asset as decommissioned, and surfaces errors', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ status: 'DECOMMISSIONED' }));
      vi.mocked(assetsApi.updateAsset)
        .mockRejectedValueOnce(new ApiError(409, 'Asset tag "X" already exists in this organization'))
        .mockRejectedValueOnce(new Error('network'));
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Status')).toHaveValue('Decommissioned');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(/already exists in this organization/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Failed to update asset')).toBeInTheDocument();
    });

    it('validates before saving', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog');
      await user.clear(within(dialog).getByLabelText('Name', { exact: false }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await within(dialog).findByText('Name is required')).toBeInTheDocument();
      expect(assetsApi.updateAsset).not.toHaveBeenCalled();
    });
  });

  describe('checking out', () => {
    it('hands the asset to a person', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.checkOutAsset).mockResolvedValue(makeAsset({ currentAssignment: out }));
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Check out' }));
      const dialog = await screen.findByRole('dialog', { name: 'Check out PUMP-001' });
      await pickOption(user, within(dialog).getByPlaceholderText('Select user'), 'Ann Store (ann@acme.test)');
      await user.click(within(dialog).getByLabelText('Expected back'));
      await user.paste('2026-12-01');
      await user.click(within(dialog).getByLabelText('Notes'));
      await user.paste('For the shutdown');
      await user.click(within(dialog).getByRole('button', { name: 'Check out' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.checkOutAsset).mock.calls[0]).toEqual([
          'asset-1',
          { assigneeId: 'u-ann', departmentId: undefined, expectedReturn: '2026-12-01', condition: 'GOOD', notes: 'For the shutdown' },
        ]);
      });
      expect(await screen.findByText('Asset checked out')).toBeInTheDocument();
    });

    it('can hand it to a department instead', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.checkOutAsset).mockResolvedValue(makeAsset());
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Check out' }));
      const dialog = await screen.findByRole('dialog');
      await pickOption(user, within(dialog).getByPlaceholderText('Select department'), 'Plant');
      await user.click(within(dialog).getByRole('button', { name: 'Check out' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.checkOutAsset).mock.calls[0][1]).toMatchObject({ departmentId: 'dept-1', assigneeId: undefined, notes: undefined });
      });
    });

    it('needs a person or a department, and surfaces errors', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.checkOutAsset)
        .mockRejectedValueOnce(new ApiError(409, 'Already checked out to Ann Store'))
        .mockRejectedValueOnce(new Error('network'));
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Check out' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Check out' }));
      expect(await within(dialog).findByText('Choose a person or a department')).toBeInTheDocument();
      expect(assetsApi.checkOutAsset).not.toHaveBeenCalled();

      await pickOption(user, within(dialog).getByPlaceholderText('Select department'), 'Plant');
      await user.click(within(dialog).getByRole('button', { name: 'Check out' }));
      expect(await screen.findByText('Already checked out to Ann Store')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Check out' }));
      expect(await screen.findByText('Failed to check out asset')).toBeInTheDocument();
    });
  });

  describe('checking in', () => {
    beforeEach(() => {
      vi.mocked(assetsApi.getAsset).mockResolvedValue(makeAsset({ currentAssignment: out, condition: 'GOOD' }));
    });

    it('takes it back, recording the condition it came back in', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.checkInAsset).mockResolvedValue(makeAsset());
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Check in' }));
      const dialog = await screen.findByRole('dialog', { name: 'Check in PUMP-001' });
      await pickOption(user, within(dialog).getByLabelText('Condition it came back in'), 'POOR');
      await user.click(within(dialog).getByLabelText('Notes'));
      await user.paste('Cracked casing');
      await user.click(within(dialog).getByRole('button', { name: 'Check in' }));

      await waitFor(() => {
        expect(vi.mocked(assetsApi.checkInAsset).mock.calls[0]).toEqual(['asset-1', { condition: 'POOR', notes: 'Cracked casing' }]);
      });
      expect(await screen.findByText('Asset checked in')).toBeInTheDocument();
    });

    it('works without notes, and surfaces errors', async () => {
      const user = userEvent.setup();
      vi.mocked(assetsApi.checkInAsset)
        .mockRejectedValueOnce(new ApiError(400, 'This asset is not checked out'))
        .mockRejectedValueOnce(new Error('network'));
      renderWithProviders(<AssetDetailPage />);

      await user.click(await screen.findByRole('button', { name: 'Check in' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Check in' }));
      expect(await screen.findByText('This asset is not checked out')).toBeInTheDocument();
      expect(vi.mocked(assetsApi.checkInAsset).mock.calls[0][1]).toEqual({ condition: 'GOOD', notes: undefined });

      await user.click(within(dialog).getByRole('button', { name: 'Check in' }));
      expect(await screen.findByText('Failed to check in asset')).toBeInTheDocument();
    });
  });
});
