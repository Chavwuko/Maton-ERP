export type StockTransactionType = 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT' | 'TRANSFER' | 'OPENING' | 'REVERSAL';
export type CreatableStockTransactionType = 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT';
export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export interface Warehouse {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  location: string | null;
  createdAt: string;
}

export interface ItemCategory {
  id: string;
  organizationId: string;
  name: string;
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
  categoryId: string | null;
  location: string | null;
  // Decimal columns arrive as strings in JSON.
  unitCost: string;
  createdAt: string;
  updatedAt: string;
  category?: ItemCategory | null;
  stockLevels?: StockLevel[];
}

// One row per live item from GET /inventory-items/overview: totals across
// warehouses, value at the weighted-average cost, and the reorder status.
export interface StockOverviewRow extends InventoryItem {
  totalOnHand: number;
  stockValue: string;
  status: StockStatus;
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
  balanceAfter: number | null;
  refType: string | null;
  refId: string | null;
  notes: string | null;
  workOrderId: string | null;
  performedById: string;
  createdAt: string;
  item?: InventoryItem;
  warehouse?: Warehouse;
}

export interface Purchase {
  id: string;
  organizationId: string;
  warehouseId: string;
  itemId: string;
  vendorId: string;
  poNumber: string | null;
  date: string;
  quantity: number;
  unitCost: string;
  total: string;
  notes: string | null;
  receivedById: string;
  createdAt: string;
  item?: InventoryItem;
  vendor?: { id: string; name: string };
  warehouse?: Warehouse;
}

export interface Consumption {
  id: string;
  organizationId: string;
  warehouseId: string;
  itemId: string;
  date: string;
  quantity: number;
  unitCost: string;
  total: string;
  projectId: string | null;
  departmentId: string | null;
  issuedTo: string | null;
  purpose: string | null;
  issuedById: string;
  // Set when the issue came from completing an appointment.
  appointmentId: string | null;
  createdAt: string;
  item?: InventoryItem;
  project?: { id: string; code: string; name: string } | null;
  department?: { id: string; name: string } | null;
  warehouse?: Warehouse;
}

export const STOCK_STATUS_COLORS: Record<StockStatus, string> = {
  IN_STOCK: 'green',
  LOW_STOCK: 'yellow',
  OUT_OF_STOCK: 'red',
};

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
};

export const STOCK_TRANSACTION_TYPE_COLORS: Record<StockTransactionType, string> = {
  RECEIPT: 'green',
  OPENING: 'blue',
  ISSUE: 'red',
  ADJUSTMENT: 'yellow',
  TRANSFER: 'grape',
  REVERSAL: 'gray',
};

// Same set the old store used, so imported items keep their units.
export const UNITS_OF_MEASURE = [
  'pcs', 'kg', 'g', 'm', 'm²', 'm³', 'L', 'mL', 'bag', 'roll', 'box', 'set', 'pair', 'length', 'drum', 'carton',
];
