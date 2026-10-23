import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as inventoryApi from '../../api/inventory';
import { StorePage } from './StorePage';
import type { InventoryItem, StockOverviewRow, StockTransaction } from './types';

vi.mock('../../api/inventory');

const item: InventoryItem = {
  id: 'item-1',
  organizationId: 'org-1',
  sku: 'BRG-6205',
  name: 'Ball Bearing 6205',
  description: null,
  unitOfMeasure: 'pcs',
  reorderPoint: 10,
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

const overview: StockOverviewRow[] = [
  { ...item, totalOnHand: 8.5, stockValue: '40.80', status: 'LOW_STOCK' },
  { ...item, id: 'item-2', sku: 'BOLT-10', name: 'Hex Bolt', reorderPoint: null, totalOnHand: 0, stockValue: '0.00', status: 'OUT_OF_STOCK' },
];

const txn: StockTransaction = {
  id: 'txn-1',
  itemId: 'item-1',
  warehouseId: 'wh-1',
  type: 'RECEIPT',
  quantity: 199.5,
  balanceAfter: 1000,
  refType: 'PURCHASE',
  refId: 'pur-1',
  notes: 'PO-100',
  workOrderId: null,
  performedById: 'user-1',
  createdAt: '2026-03-05T00:00:00.000Z',
  item,
  warehouse,
};

describe('StorePage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(inventoryApi.getStockOverview).mockResolvedValue(overview);
    vi.mocked(inventoryApi.listStockTransactions).mockResolvedValue([txn]);
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([item]);
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([warehouse]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Available stock', () => {
    it('lists stock with status badges and the total stock value', async () => {
      renderWithProviders(<StorePage />);

      expect(await screen.findByText('BRG-6205 — Ball Bearing 6205')).toBeInTheDocument();
      expect(screen.getByText('8.5 pcs')).toBeInTheDocument();
      expect(screen.getByText('Low stock')).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
      expect(screen.getByText('2 items', { exact: false })).toBeInTheDocument();
      expect(screen.getAllByText('40.80').length).toBeGreaterThan(0);
    });

    it('shows an empty state and an error state', async () => {
      vi.mocked(inventoryApi.getStockOverview).mockResolvedValueOnce([]);
      const { unmount } = renderWithProviders(<StorePage />);
      expect(await screen.findByText('No stock yet.')).toBeInTheDocument();
      expect(screen.getByText('0 items', { exact: false })).toBeInTheDocument();
      unmount();

      vi.mocked(inventoryApi.getStockOverview).mockRejectedValue(new ApiError(500, 'Server down'));
      renderWithProviders(<StorePage />);
      expect(await screen.findByText('Server down')).toBeInTheDocument();
    });

    it('uses the singular for a single item', async () => {
      vi.mocked(inventoryApi.getStockOverview).mockResolvedValue([overview[0]]);

      renderWithProviders(<StorePage />);

      expect(await screen.findByText('1 item', { exact: false })).toBeInTheDocument();
    });

    it('hides the stock-take button from non-managers', async () => {
      setCurrentRole('hse');
      renderWithProviders(<StorePage />);
      await screen.findByText('BRG-6205 — Ball Bearing 6205');

      expect(screen.queryByRole('button', { name: 'Stock take' })).not.toBeInTheDocument();
    });

    it('records a stock count', async () => {
      const user = userEvent.setup();
      vi.mocked(inventoryApi.adjustStock).mockResolvedValue(txn);

      renderWithProviders(<StorePage />);
      await screen.findByText('BRG-6205 — Ball Bearing 6205');

      await user.click(screen.getAllByRole('button', { name: 'Stock take' })[0]);
      const dialog = await screen.findByRole('dialog', { name: 'Stock take — BRG-6205' });
      await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
      await user.type(within(dialog).getByLabelText('Counted quantity', { exact: false }), '7.75');
      await user.type(within(dialog).getByLabelText('Reason', { exact: false }), 'Annual count');
      await user.click(within(dialog).getByRole('button', { name: 'Record count' }));

      await waitFor(() => {
        expect(vi.mocked(inventoryApi.adjustStock).mock.calls[0][0]).toEqual({
          itemId: 'item-1',
          warehouseId: 'wh-1',
          countedQuantity: 7.75,
          reason: 'Annual count',
        });
      });
      expect(await screen.findByText('Stock count recorded')).toBeInTheDocument();
    });

    it('validates the count form and surfaces API errors', async () => {
      const user = userEvent.setup();
      vi.mocked(inventoryApi.adjustStock).mockRejectedValue(new ApiError(400, 'Nothing to adjust'));

      renderWithProviders(<StorePage />);
      await screen.findByText('BRG-6205 — Ball Bearing 6205');

      await user.click(screen.getAllByRole('button', { name: 'Stock take' })[0]);
      const dialog = await screen.findByRole('dialog', { name: 'Stock take — BRG-6205' });
      await user.click(within(dialog).getByRole('button', { name: 'Record count' }));
      expect(await within(dialog).findByText('Warehouse is required')).toBeInTheDocument();
      expect(within(dialog).getByText('Counted quantity is required')).toBeInTheDocument();
      expect(within(dialog).getByText('A reason is required')).toBeInTheDocument();
      expect(inventoryApi.adjustStock).not.toHaveBeenCalled();

      await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
      await user.type(within(dialog).getByLabelText('Counted quantity', { exact: false }), '8.5');
      await user.type(within(dialog).getByLabelText('Reason', { exact: false }), 'Recount');
      await user.click(within(dialog).getByRole('button', { name: 'Record count' }));

      expect(await screen.findByText('Nothing to adjust')).toBeInTheDocument();
    });
  });

  describe('Ledger', () => {
    async function openLedger(user: ReturnType<typeof userEvent.setup>) {
      renderWithProviders(<StorePage />);
      await user.click(screen.getByRole('tab', { name: 'Ledger' }));
    }

    // Mantine Tabs keeps the inactive panel mounted, and each Select keeps
    // its (closed) option list mounted — so scope queries to the ledger table.
    const ledgerTable = async () =>
      within(screen.getByRole('tabpanel', { name: 'Ledger' })).findByRole('table');

    it('lists movements with a type badge and the running balance', async () => {
      const user = userEvent.setup();
      await openLedger(user);

      const table = within(await ledgerTable());
      expect(await table.findByText('RECEIPT')).toBeInTheDocument();
      expect(table.getByText('199.5')).toBeInTheDocument();
      expect(table.getByText('1,000')).toBeInTheDocument();
      expect(table.getByText('PO-100')).toBeInTheDocument();
      expect(table.getByText('WH-MAIN')).toBeInTheDocument();
    });

    it('shows dashes for movements with no balance, notes or loaded relations', async () => {
      const user = userEvent.setup();
      vi.mocked(inventoryApi.listStockTransactions).mockResolvedValue([
        { ...txn, balanceAfter: null, notes: null, item: undefined, warehouse: undefined },
      ]);
      await openLedger(user);

      const table = within(await ledgerTable());
      expect(await table.findByText('item-1')).toBeInTheDocument();
      expect(table.getAllByText('—')).toHaveLength(3);
    });

    it('shows an empty state and an error state', async () => {
      const user = userEvent.setup();
      vi.mocked(inventoryApi.listStockTransactions).mockResolvedValueOnce([]);
      await openLedger(user);
      expect(await screen.findByText('No movements match.')).toBeInTheDocument();
    });

    it('shows an error when the ledger fails to load', async () => {
      const user = userEvent.setup();
      vi.mocked(inventoryApi.listStockTransactions).mockRejectedValue(new ApiError(500, 'Ledger down'));
      await openLedger(user);
      expect(await screen.findByText('Ledger down')).toBeInTheDocument();
    });

    it('passes the item, type and date filters to the API', async () => {
      const user = userEvent.setup();
      await openLedger(user);
      await within(await ledgerTable()).findByText('RECEIPT');

      const panel = screen.getByRole('tabpanel', { name: 'Ledger' });
      await pickOption(user, within(panel).getByPlaceholderText('Select item'), 'BRG-6205 — Ball Bearing 6205');
      await pickOption(user, within(panel).getByPlaceholderText('All types'), 'ISSUE');
      await user.type(within(panel).getByLabelText('From'), '2026-03-01');
      await user.type(within(panel).getByLabelText('To'), '2026-03-31');

      await waitFor(() => {
        expect(vi.mocked(inventoryApi.listStockTransactions)).toHaveBeenLastCalledWith({
          itemId: 'item-1',
          type: 'ISSUE',
          from: '2026-03-01',
          to: '2026-03-31',
        });
      });
    });
  });

  describe('for the staff role', () => {
    it('shows stock but no value anywhere', async () => {
      setCurrentRole('staff');
      renderWithProviders(<StorePage />);
      await screen.findByText('BRG-6205 — Ball Bearing 6205');

      expect(screen.getByText('2 items')).toBeInTheDocument();
      expect(screen.queryByText('Value')).not.toBeInTheDocument();
      expect(screen.queryByText('stock value', { exact: false })).not.toBeInTheDocument();
      expect(screen.queryByText('40.80')).not.toBeInTheDocument();
    });

    it('sizes the empty row to the visible columns', async () => {
      setCurrentRole('staff');
      vi.mocked(inventoryApi.getStockOverview).mockResolvedValue([]);
      renderWithProviders(<StorePage />);

      expect(await screen.findByText('No stock yet.')).toHaveAttribute('colspan', '4');
    });
  });
});
