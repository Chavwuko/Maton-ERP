import { apiClient } from './client';
import type {
  CreatableStockTransactionType,
  InventoryItem,
  StockTransaction,
  Warehouse,
  WarehouseWithStock,
} from '../modules/inventory/types';

export function listWarehouses(filters: { organizationId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  const qs = params.toString();
  return apiClient.get<Warehouse[]>(`/warehouses${qs ? `?${qs}` : ''}`);
}

export function getWarehouse(id: string) {
  return apiClient.get<WarehouseWithStock>(`/warehouses/${id}`);
}

export function createWarehouse(data: { organizationId: string; code: string; name: string; location?: string }) {
  return apiClient.post<Warehouse>('/warehouses', data);
}

export function listInventoryItems(filters: { organizationId?: string; belowReorderPoint?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  if (filters.belowReorderPoint) params.set('belowReorderPoint', 'true');
  const qs = params.toString();
  return apiClient.get<InventoryItem[]>(`/inventory-items${qs ? `?${qs}` : ''}`);
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
}) {
  return apiClient.post<InventoryItem>('/inventory-items', data);
}

export function listStockTransactions(filters: { itemId?: string; warehouseId?: string; workOrderId?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<StockTransaction[]>(`/stock-transactions${qs ? `?${qs}` : ''}`);
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

export function transferStock(data: {
  itemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
}) {
  return apiClient.post<{ out: StockTransaction; in: StockTransaction }>('/stock-transactions/transfer', data);
}
