import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as inventoryApi from '../../api/inventory';
import { InventoryItemDetailPage } from './InventoryItemDetailPage';
import type { InventoryItem } from './types';

vi.mock('../../api/inventory');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'item-1' }) };
});

const baseItem: InventoryItem = {
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
  stockLevels: [
    {
      id: 'sl-1',
      itemId: 'item-1',
      warehouseId: 'wh-1',
      quantityOnHand: 8,
      updatedAt: '2026-01-01T00:00:00.000Z',
      warehouse: { id: 'wh-1', organizationId: 'org-1', code: 'WH-MAIN', name: 'Main', location: null, createdAt: '2026-01-01T00:00:00.000Z' },
    },
  ],
};

describe('InventoryItemDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(inventoryApi.listStockTransactions).mockResolvedValue([]);
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([
      { id: 'wh-1', organizationId: 'org-1', code: 'WH-MAIN', name: 'Main', location: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders stock by warehouse and hides mutation buttons for a non-manager role', async () => {
    setCurrentRole('hse');
    vi.mocked(inventoryApi.getInventoryItem).mockResolvedValue(baseItem);

    renderWithProviders(<InventoryItemDetailPage />);

    expect(await screen.findByText('WH-MAIN — Main')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record transaction' })).not.toBeInTheDocument();
  });

  it('records a stock transaction', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.getInventoryItem).mockResolvedValue(baseItem);
    vi.mocked(inventoryApi.recordStockTransaction).mockResolvedValue({
      id: 'txn-1',
      itemId: 'item-1',
      warehouseId: 'wh-1',
      type: 'RECEIPT',
      quantity: 20,
      notes: null,
      workOrderId: null,
      performedById: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    renderWithProviders(<InventoryItemDetailPage />);
    await screen.findByText('WH-MAIN — Main');

    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    await user.click(await screen.findByPlaceholderText('Select warehouse'));
    // The background "Stock by warehouse" table already shows this same
    // text, so wait for the dropdown to add a second match, then click it
    // (Mantine's shared portal node is mounted before the app content, so
    // the dropdown option is the first match, not the second).
    const options = await waitFor(() => {
      const matches = screen.getAllByText('WH-MAIN — Main');
      expect(matches).toHaveLength(2);
      return matches;
    });
    await user.click(options[0]);
    await user.type(screen.getByLabelText('Quantity', { exact: false }), '20');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    await waitFor(() => {
      expect(inventoryApi.recordStockTransaction).toHaveBeenCalledWith({
        itemId: 'item-1',
        warehouseId: 'wh-1',
        type: 'RECEIPT',
        quantity: 20,
        notes: undefined,
      });
    });
    expect(await screen.findByText('Transaction recorded')).toBeInTheDocument();
  });
});
