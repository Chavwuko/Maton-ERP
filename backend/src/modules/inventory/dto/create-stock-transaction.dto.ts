export class CreateStockTransactionDto {
  itemId!: string;
  warehouseId!: string;
  // RECEIPT/ISSUE: a positive count of units. ADJUSTMENT: a signed delta
  // (positive to correct a stock shortfall, negative to correct an excess).
  type!: 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT';
  quantity!: number;
  notes?: string;
  workOrderId?: string;
}
