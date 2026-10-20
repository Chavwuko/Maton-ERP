export class CreateInventoryItemDto {
  organizationId!: string;
  sku!: string;
  name!: string;
  unitOfMeasure!: string;
  description?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  categoryId?: string;
  location?: string;
  // Starting weighted-average cost; purchases adjust it from there.
  unitCost?: number;
  // Stock already on hand today. Needs openingWarehouseId to say where.
  openingStock?: number;
  openingWarehouseId?: string;
}
