export class TransferStockDto {
  itemId!: string;
  fromWarehouseId!: string;
  toWarehouseId!: string;
  quantity!: number;
  notes?: string;
}
