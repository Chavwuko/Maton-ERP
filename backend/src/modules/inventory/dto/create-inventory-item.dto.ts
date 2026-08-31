export class CreateInventoryItemDto {
  organizationId!: string;
  sku!: string;
  name!: string;
  unitOfMeasure!: string;
  description?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
}
