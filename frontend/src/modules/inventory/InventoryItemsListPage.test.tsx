import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as inventoryApi from '../../api/inventory';
import { InventoryItemsListPage } from './InventoryItemsListPage';

vi.mock('../../api/inventory');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleItems = [
  {
    id: 'item-1',
    organizationId: 'org-1',
    sku: 'BRG-6205',
    name: 'Ball Bearing 6205',
    description: null,
    unitOfMeasure: 'EA',
    reorderPoint: 10,
    reorderQuantity: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    stockLevels: [{ id: 'sl-1', itemId: 'item-1', warehouseId: 'wh-1', quantityOnHand: 8, updatedAt: '2026-01-01T00:00:00.000Z' }],
  },
];

describe('InventoryItemsListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders items with their summed on-hand quantity', async () => {
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue(sampleItems);

    renderWithProviders(<InventoryItemsListPage />);

    expect(await screen.findByText('BRG-6205')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows an empty state when there are no items', async () => {
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([]);

    renderWithProviders(<InventoryItemsListPage />);

    expect(await screen.findByText('No inventory items yet.')).toBeInTheDocument();
  });

  it('shows "New item" for admin/inventory but not for a non-manager role', async () => {
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([]);

    setCurrentRole('hse');
    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('No inventory items yet.');

    expect(screen.queryByRole('button', { name: 'New item' })).not.toBeInTheDocument();
  });

  it('creates an item and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([]);
    vi.mocked(inventoryApi.createInventoryItem).mockResolvedValue({ ...sampleItems[0], id: 'item-2', sku: 'BOLT-10' });

    renderWithProviders(<InventoryItemsListPage />);
    await screen.findByText('No inventory items yet.');

    await user.click(screen.getByRole('button', { name: 'New item' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('SKU', { exact: false }), 'BOLT-10');
    await user.type(screen.getByLabelText('Name', { exact: false }), 'Hex Bolt M10');
    await user.type(screen.getByLabelText('Unit of measure', { exact: false }), 'EA');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.createInventoryItem).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        sku: 'BOLT-10',
        name: 'Hex Bolt M10',
        unitOfMeasure: 'EA',
      });
    });
    expect(await screen.findByText('Item created')).toBeInTheDocument();
  });
});
