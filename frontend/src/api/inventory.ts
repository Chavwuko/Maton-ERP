import { apiClient } from './client';
import type {
  Consumption,
  CreatableStockTransactionType,
  InventoryItem,
  ItemCategory,
  Purchase,
  StockOverviewRow,
  StockTransaction,
  StockTransactionType,
  Warehouse,
  WarehouseWithStock,
} from '../modules/inventory/types';

function query(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listWarehouses(filters: { organizationId?: string } = {}) {
  return apiClient.get<Warehouse[]>(`/warehouses${query(filters)}`);
}

export function getWarehouse(id: string) {
  return apiClient.get<WarehouseWithStock>(`/warehouses/${id}`);
}

export function createWarehouse(data: { organizationId: string; code: string; name: string; location?: string }) {
  return apiClient.post<Warehouse>('/warehouses', data);
}

export function listItemCategories(filters: { organizationId?: string } = {}) {
  return apiClient.get<ItemCategory[]>(`/item-categories${query(filters)}`);
}

export function createItemCategory(data: { organizationId: string; name: string }) {
  return apiClient.post<ItemCategory>('/item-categories', data);
}

export function listInventoryItems(filters: { organizationId?: string; belowReorderPoint?: boolean } = {}) {
  return apiClient.get<InventoryItem[]>(
    `/inventory-items${query({
      organizationId: filters.organizationId,
      belowReorderPoint: filters.belowReorderPoint ? 'true' : undefined,
    })}`,
  );
}

export function getStockOverview(filters: { organizationId?: string } = {}) {
  return apiClient.get<StockOverviewRow[]>(`/inventory-items/overview${query(filters)}`);
}

export function getInventoryItem(id: string) {
  return apiClient.get<InventoryItem>(`/inventory-items/${id}`);
}

export function createInventoryItem(data: {
  organizationId: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  description?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  categoryId?: string;
  location?: string;
  unitCost?: number;
  openingStock?: number;
  openingWarehouseId?: string;
}) {
  return apiClient.post<InventoryItem>('/inventory-items', data);
}

export function updateInventoryItem(
  id: string,
  data: {
    sku?: string;
    name?: string;
    unitOfMeasure?: string;
    description?: string;
    reorderPoint?: number;
    reorderQuantity?: number;
    categoryId?: string;
    location?: string;
  },
) {
  return apiClient.patch<InventoryItem>(`/inventory-items/${id}`, data);
}

export function deleteInventoryItem(id: string) {
  return apiClient.delete<InventoryItem>(`/inventory-items/${id}`);
}

export function listStockTransactions(
  filters: {
    itemId?: string;
    warehouseId?: string;
    workOrderId?: string;
    type?: StockTransactionType;
    from?: string;
    to?: string;
  } = {},
) {
  return apiClient.get<StockTransaction[]>(`/stock-transactions${query(filters)}`);
}

export function recordStockTransaction(data: {
  itemId: string;
  warehouseId: string;
  type: CreatableStockTransactionType;
  quantity: number;
  notes?: string;
  workOrderId?: string;
}) {
  return apiClient.post<StockTransaction>('/stock-transactions', data);
}

export function adjustStock(data: { itemId: string; warehouseId: string; countedQuantity: number; reason: string }) {
  return apiClient.post<StockTransaction>('/stock-transactions/adjust', data);
}

export function transferStock(data: {
  itemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
}) {
  return apiClient.post<{ out: StockTransaction; in: StockTransaction }>('/stock-transactions/transfer', data);
}

export function listPurchases(
  filters: { organizationId?: string; vendorId?: string; itemId?: string; from?: string; to?: string } = {},
) {
  return apiClient.get<Purchase[]>(`/purchases${query(filters)}`);
}

export function recordPurchase(data: {
  warehouseId: string;
  itemId: string;
  vendorId: string;
  quantity: number;
  unitCost: number;
  date?: string;
  poNumber?: string;
  notes?: string;
}) {
  return apiClient.post<Purchase>('/purchases', data);
}

export function deletePurchase(id: string) {
  return apiClient.delete<Purchase>(`/purchases/${id}`);
}

export function listConsumptions(
  filters: {
    organizationId?: string;
    departmentId?: string;
    projectId?: string;
    itemId?: string;
    from?: string;
    to?: string;
  } = {},
) {
  return apiClient.get<Consumption[]>(`/consumptions${query(filters)}`);
}

export function recordConsumption(data: {
  warehouseId: string;
  itemId: string;
  quantity: number;
  date?: string;
  departmentId?: string;
  projectId?: string;
  issuedTo?: string;
  purpose?: string;
}) {
  return apiClient.post<Consumption>('/consumptions', data);
}

export function deleteConsumption(id: string) {
  return apiClient.delete<Consumption>(`/consumptions/${id}`);
}
