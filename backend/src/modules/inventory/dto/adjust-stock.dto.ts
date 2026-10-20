// A stock-take: say what was physically counted and why it differs; the
// service works out the signed delta against the system quantity.
export class AdjustStockDto {
  itemId!: string;
  warehouseId!: string;
  countedQuantity!: number;
  reason!: string;
}
