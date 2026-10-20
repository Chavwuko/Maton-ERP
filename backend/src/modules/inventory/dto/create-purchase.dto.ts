// organizationId is taken from the item, never from the client.
export class CreatePurchaseDto {
  warehouseId!: string;
  itemId!: string;
  vendorId!: string;
  quantity!: number;
  unitCost!: number;
  date?: string;
  poNumber?: string;
  notes?: string;
}
