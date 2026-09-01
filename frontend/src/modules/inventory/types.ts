export type StockTransactionType = 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT' | 'TRANSFER';
export type CreatableStockTransactionType = 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT';

export interface Warehouse {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  location: string | null;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  createdAt: string;
  updatedAt: string;
  stockLevels?: StockLevel[];
}

export interface StockLevel {
  id: string;
  itemId: string;
  warehouseId: string;
  quantityOnHand: number;
  updatedAt: string;
  item?: InventoryItem;
  warehouse?: Warehouse;
}

export interface WarehouseWithStock extends Warehouse {
  stockLevels: StockLevel[];
}

export interface StockTransaction {
  id: string;
  itemId: string;
  warehouseId: string;
  type: StockTransactionType;
  quantity: number;
  notes: string | null;
  workOrderId: string | null;
  performedById: string;
  createdAt: string;
}
