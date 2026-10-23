import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as inventoryApi from '../../api/inventory';
import { PurchasesPage } from './PurchasesPage';
import type { InventoryItem, Purchase } from './types';

vi.mock('../../api/inventory');
vi.mock('../../api/accounting', () => ({
  listVendors: vi.fn().mockResolvedValue([{ id: 'ven-1', name: 'Acme Supplies' }]),
}));

const item: InventoryItem = {
  id: 'item-1',
  organizationId: 'org-1',
  sku: 'BRG-6205',
  name: 'Ball Bearing 6205',
  description: null,
  unitOfMeasure: 'pcs',
  reorderPoint: null,
  reorderQuantity: null,
  categoryId: null,
  location: null,
  unitCost: '4.80',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const warehouse = {
  id: 'wh-1',
  organizationId: 'org-1',
  code: 'WH-MAIN',
  name: 'Main',
  location: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const purchase: Purchase = {
  id: 'pur-1',
  organizationId: 'org-1',
  warehouseId: 'wh-1',
  itemId: 'item-1',
  vendorId: 'ven-1',
  poNumber: 'PO-100',
  date: '2026-03-05T00:00:00.000Z',
  quantity: 199.5,
  unitCost: '6.00',
  total: '1197.00',
  notes: null,
  receivedById: 'user-1',
  createdAt: '2026-03-05T00:00:00.000Z',
  item,
  vendor: { id: 'ven-1', name: 'Acme Supplies' },
  warehouse,
};

describe('PurchasesPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(inventoryApi.listPurchases).mockResolvedValue([purchase]);
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([item]);
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([warehouse]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders purchases with supplier, quantity and totals', async () => {
    renderWithProviders(<PurchasesPage />);

    expect(await screen.findByText('PO-100')).toBeInTheDocument();
    expect(screen.getByText('BRG-6205 — Ball Bearing 6205')).toBeInTheDocument();
    expect(screen.getByText('Acme Supplies')).toBeInTheDocument();
    expect(screen.getByText('199.5 pcs')).toBeInTheDocument();
    expect(screen.getByText('1,197.00')).toBeInTheDocument();
  });

  it('shows an empty state and an error state', async () => {
    vi.mocked(inventoryApi.listPurchases).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<PurchasesPage />);
    expect(await screen.findByText('No purchases yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(inventoryApi.listPurchases).mockRejectedValue(new ApiError(500, 'Server down'));
    renderWithProviders(<PurchasesPage />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('re-queries with the date range', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    await user.type(screen.getByLabelText('From'), '2026-03-01');
    await user.type(screen.getByLabelText('To'), '2026-03-31');

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.listPurchases)).toHaveBeenLastCalledWith({ from: '2026-03-01', to: '2026-03-31' });
    });
  });

  it('hides record/delete from a non-manager role and delete from the inventory role', async () => {
    setCurrentRole('hse');
    const { unmount } = renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');
    expect(screen.queryByRole('button', { name: 'Record purchase' })).not.toBeInTheDocument();
    unmount();

    setCurrentRole('inventory');
    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');
    expect(screen.getByRole('button', { name: 'Record purchase' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete purchase/ })).not.toBeInTheDocument();
  });

  it('records a purchase', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.recordPurchase).mockResolvedValue(purchase);

    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    await user.click(screen.getByRole('button', { name: 'Record purchase' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record purchase' });
    await pickOption(user, within(dialog).getByPlaceholderText('Select item'), 'BRG-6205 — Ball Bearing 6205');
    await pickOption(user, within(dialog).getByPlaceholderText('Select vendor'), 'Acme Supplies');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
    await user.type(within(dialog).getByLabelText('Quantity', { exact: false }), '25.5');
    await user.type(within(dialog).getByLabelText('Unit cost', { exact: false }), '7.25');
    await user.type(within(dialog).getByLabelText('PO number'), 'PO-200');
    await user.click(within(dialog).getByRole('button', { name: 'Record' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.recordPurchase).mock.calls[0][0]).toMatchObject({
        itemId: 'item-1',
        vendorId: 'ven-1',
        warehouseId: 'wh-1',
        quantity: 25.5,
        unitCost: 7.25,
        poNumber: 'PO-200',
      });
    });
    expect(await screen.findByText('Purchase recorded')).toBeInTheDocument();
  });

  it('validates required fields and surfaces API errors', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.recordPurchase).mockRejectedValue(new ApiError(400, 'Quantity too large'));

    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    await user.click(screen.getByRole('button', { name: 'Record purchase' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record purchase' });
    await user.click(within(dialog).getByRole('button', { name: 'Record' }));
    expect(await within(dialog).findByText('Item is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Supplier is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Quantity must be positive')).toBeInTheDocument();
    expect(inventoryApi.recordPurchase).not.toHaveBeenCalled();

    await pickOption(user, within(dialog).getByPlaceholderText('Select item'), 'BRG-6205 — Ball Bearing 6205');
    await pickOption(user, within(dialog).getByPlaceholderText('Select vendor'), 'Acme Supplies');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
    await user.type(within(dialog).getByLabelText('Quantity', { exact: false }), '1');
    await user.type(within(dialog).getByLabelText('Unit cost', { exact: false }), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Record' }));

    expect(await screen.findByText('Quantity too large')).toBeInTheDocument();
  });

  it('deletes a purchase after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(inventoryApi.deletePurchase).mockResolvedValue(purchase);

    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    await user.click(screen.getByRole('button', { name: 'Delete purchase PO-100' }));

    await waitFor(() => expect(vi.mocked(inventoryApi.deletePurchase).mock.calls[0][0]).toBe('pur-1'));
    expect(await screen.findByText('Purchase deleted and stock reversed')).toBeInTheDocument();
  });

  it('keeps the purchase when the confirmation is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    await user.click(screen.getByRole('button', { name: 'Delete purchase PO-100' }));

    expect(inventoryApi.deletePurchase).not.toHaveBeenCalled();
  });

  it('shows the API error when a delete is refused', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(inventoryApi.deletePurchase).mockRejectedValue(new ApiError(400, 'Stock already issued'));

    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    await user.click(screen.getByRole('button', { name: 'Delete purchase PO-100' }));

    expect(await screen.findByText('Stock already issued')).toBeInTheDocument();
  });

  it('hides unit cost and totals from the staff role', async () => {
    setCurrentRole('staff');
    renderWithProviders(<PurchasesPage />);
    await screen.findByText('PO-100');

    expect(screen.queryByText('Unit cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByText('1,197.00')).not.toBeInTheDocument();
  });
});
