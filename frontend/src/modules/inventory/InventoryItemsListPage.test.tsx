import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import * as inventoryApi from '../../api/inventory';
import { InventoryItemsListPage } from './InventoryItemsListPage';
import type { StockOverviewRow } from './types';

vi.mock('../../api/inventory');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const baseRow: StockOverviewRow = {
  id: 'item-1',
  organizationId: 'org-1',
  sku: 'BRG-6205',
  name: 'Ball Bearing 6205',
  description: null,
  unitOfMeasure: 'pcs',
  reorderPoint: 10,
  reorderQuantity: 20,
  categoryId: 'cat-1',
  location: 'Shelf A3',
  unitCost: '4.80',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  category: { id: 'cat-1', organizationId: 'org-1', name: 'Bearings', createdAt: '2026-01-01T00:00:00.000Z' },
  totalOnHand: 8,
  stockValue: '38.40',
  status: 'LOW_STOCK',
};

const rows: StockOverviewRow[] = [
  baseRow,
  {
    ...baseRow,
    id: 'item-2',
    sku: 'BOLT-10',
    name: 'Hex Bolt M10',
    location: 'Bin 7',
    categoryId: 'cat-2',
    category: { id: 'cat-2', organizationId: 'org-1', name: 'Fasteners', createdAt: '2026-01-01T00:00:00.000Z' },
    totalOnHand: 500,
    stockValue: '250.00',
    unitCost: '0.50',
    status: 'IN_STOCK',
  },
];

// Pasting is one event instead of one per character — this form has enough
// fields that typing them all pushes a test past the timeout under load.
async function fill(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.click(input);
  await user.paste(text);
}

describe('InventoryItemsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(inventoryApi.getStockOverview).mockResolvedValue(rows);
    vi.mocked(inventoryApi.listItemCategories).mockResolvedValue([
      { id: 'cat-1', organizationId: 'org-1', name: 'Bearings', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'cat-2', organizationId: 'org-1', name: 'Fasteners', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([
      { id: 'wh-1', organizationId: 'org-1', code: 'WH-MAIN', name: 'Main', location: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders items with on-hand, cost, value and a status badge', async () => {
    renderWithProviders(<InventoryItemsListPage />);

    expect(await screen.findByText('BRG-6205')).toBeInTheDocument();
    // The filter dropdowns keep their option text mounted, so scope to the table.
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Bearings')).toBeInTheDocument();
    expect(table.getByText('Shelf A3')).toBeInTheDocument();
    expect(table.getByText('38.40')).toBeInTheDocument();
    expect(table.getByText('Low stock')).toBeInTheDocument();
    expect(table.getByText('In stock')).toBeInTheDocument();
  });

  it('shows an empty state when there are no items', async () => {
    vi.mocked(inventoryApi.getStockOverview).mockResolvedValue([]);

    renderWithProviders(<InventoryItemsListPage />);

    expect(await screen.findByText('No inventory items yet.')).toBeInTheDocument();
  });

  it('shows an error when the items fail to load', async () => {
    vi.mocked(inventoryApi.getStockOverview).mockRejectedValue(new Error('boom'));

    renderWithProviders(<InventoryItemsListPage />);

    expect(await screen.findByText("Couldn't load inventory items")).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.type(screen.getByLabelText('Search items'), 'bolt');

    expect(screen.queryByText('BRG-6205')).not.toBeInTheDocument();
    expect(screen.getByText('BOLT-10')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search items'));
    await user.type(screen.getByLabelText('Search items'), 'zzz');
    expect(await screen.findByText('No items match the current filters.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await pickOption(user, screen.getByPlaceholderText('All statuses'), 'Low stock');

    expect(screen.getByText('BRG-6205')).toBeInTheDocument();
    expect(screen.queryByText('BOLT-10')).not.toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await pickOption(user, screen.getByPlaceholderText('All categories'), 'Fasteners');

    expect(screen.queryByText('BRG-6205')).not.toBeInTheDocument();
    expect(screen.getByText('BOLT-10')).toBeInTheDocument();
  });

  it('hides the management buttons from a non-manager role', async () => {
    setCurrentRole('hse');
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    expect(screen.queryByRole('button', { name: 'New item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('lets the inventory role edit but only admin delete', async () => {
    setCurrentRole('inventory');
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Delete BRG-6205' })).not.toBeInTheDocument();
  });

  it('creates an item with category, cost and opening stock', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.createInventoryItem).mockResolvedValue({ ...baseRow, id: 'item-3' });

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'New item' }));
    const dialog = await screen.findByRole('dialog', { name: 'New inventory item' });
    await pickOption(user, within(dialog).getByPlaceholderText('Select organization'), 'Acme Industrial');
    await fill(user, within(dialog).getByLabelText('SKU', { exact: false }), 'NUT-10');
    await fill(user, within(dialog).getByLabelText('Name', { exact: false }), 'Hex Nut M10');
    await pickOption(user, within(dialog).getByPlaceholderText('Select unit'), 'pcs');
    await pickOption(user, within(dialog).getByPlaceholderText('Select category'), 'Fasteners');
    await fill(user, within(dialog).getByLabelText('Location'), 'Bin 7');
    await fill(user, within(dialog).getByLabelText('Unit cost', { exact: false }), '1.25');
    await fill(user, within(dialog).getByLabelText('Opening stock'), '40');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.createInventoryItem).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        sku: 'NUT-10',
        name: 'Hex Nut M10',
        unitOfMeasure: 'pcs',
        categoryId: 'cat-2',
        location: 'Bin 7',
        unitCost: 1.25,
        openingStock: 40,
        openingWarehouseId: 'wh-1',
      });
    });
    expect(await screen.findByText('Item created')).toBeInTheDocument();
  });

  it('requires a warehouse when opening stock is entered', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'New item' }));
    const dialog = await screen.findByRole('dialog', { name: 'New inventory item' });
    await pickOption(user, within(dialog).getByPlaceholderText('Select organization'), 'Acme Industrial');
    await user.type(within(dialog).getByLabelText('SKU', { exact: false }), 'NUT-10');
    await user.type(within(dialog).getByLabelText('Name', { exact: false }), 'Hex Nut M10');
    await pickOption(user, within(dialog).getByPlaceholderText('Select unit'), 'pcs');
    await user.type(within(dialog).getByLabelText('Opening stock'), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Warehouse is required for opening stock')).toBeInTheDocument();
    expect(inventoryApi.createInventoryItem).not.toHaveBeenCalled();
  });

  it('surfaces the API error when creating fails', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../api/client');
    vi.mocked(inventoryApi.createInventoryItem).mockRejectedValue(new ApiError(409, 'SKU already exists'));

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'New item' }));
    const dialog = await screen.findByRole('dialog', { name: 'New inventory item' });
    await pickOption(user, within(dialog).getByPlaceholderText('Select organization'), 'Acme Industrial');
    await user.type(within(dialog).getByLabelText('SKU', { exact: false }), 'BRG-6205');
    await user.type(within(dialog).getByLabelText('Name', { exact: false }), 'Dup');
    await pickOption(user, within(dialog).getByPlaceholderText('Select unit'), 'pcs');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('SKU already exists')).toBeInTheDocument();
  });

  it('edits an item', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.updateInventoryItem).mockResolvedValue(baseRow);

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit BRG-6205' });
    const location = within(dialog).getByLabelText('Location');
    expect(location).toHaveValue('Shelf A3');
    await user.clear(location);
    await user.type(location, 'Shelf B1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.updateInventoryItem).mock.calls[0][0]).toBe('item-1');
      expect(vi.mocked(inventoryApi.updateInventoryItem).mock.calls[0][1]).toMatchObject({
        sku: 'BRG-6205',
        location: 'Shelf B1',
        categoryId: 'cat-1',
        reorderPoint: 10,
      });
    });
    expect(await screen.findByText('Item updated')).toBeInTheDocument();
  });

  it('deletes an item after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(inventoryApi.deleteInventoryItem).mockResolvedValue(baseRow);

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'Delete BRG-6205' }));

    await waitFor(() => expect(vi.mocked(inventoryApi.deleteInventoryItem).mock.calls[0][0]).toBe('item-1'));
    expect(await screen.findByText('Item deleted')).toBeInTheDocument();
  });

  it('does not delete when the confirmation is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'Delete BRG-6205' }));

    expect(inventoryApi.deleteInventoryItem).not.toHaveBeenCalled();
  });

  it('shows the API error when a delete is refused', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../api/client');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(inventoryApi.deleteInventoryItem).mockRejectedValue(new ApiError(400, 'Item still has stock'));

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'Delete BRG-6205' }));

    expect(await screen.findByText('Item still has stock')).toBeInTheDocument();
  });

  it('adds a category', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.createItemCategory).mockResolvedValue({
      id: 'cat-3',
      organizationId: 'org-1',
      name: 'Cables',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'Categories' }));
    const dialog = await screen.findByRole('dialog', { name: 'Item categories' });
    await pickOption(user, within(dialog).getByPlaceholderText('Select organization'), 'Acme Industrial');
    await user.type(within(dialog).getByLabelText('New category', { exact: false }), 'Cables');
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.createItemCategory).mock.calls[0][0]).toEqual({
        organizationId: 'org-1',
        name: 'Cables',
      });
    });
    expect(await screen.findByText('Category added')).toBeInTheDocument();
  });

  it('shows an empty-categories message', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.listItemCategories).mockResolvedValue([]);

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    await user.click(screen.getByRole('button', { name: 'Categories' }));

    expect(await screen.findByText('No categories yet.')).toBeInTheDocument();
  });

  it('hides unit cost and value from the staff role', async () => {
    setCurrentRole('staff');
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('BRG-6205');

    const table = within(screen.getByRole('table'));
    expect(table.queryByText('Unit cost')).not.toBeInTheDocument();
    expect(table.queryByText('Value')).not.toBeInTheDocument();
    expect(table.queryByText('38.40')).not.toBeInTheDocument();
    expect(table.getByText('Low stock')).toBeInTheDocument();
  });

  it('keeps the empty row as wide as the visible columns for staff', async () => {
    setCurrentRole('staff');
    vi.mocked(inventoryApi.getStockOverview).mockResolvedValue([]);
    renderWithProviders(<InventoryItemsListPage />);

    expect(await screen.findByText('No inventory items yet.')).toHaveAttribute('colspan', '7');
  });
});
