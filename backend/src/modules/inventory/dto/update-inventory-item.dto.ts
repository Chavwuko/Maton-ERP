// unitCost is deliberately absent: it's a weighted average maintained by
// purchases, not something to overwrite by hand.
export class UpdateInventoryItemDto {
  sku?: string;
  name?: string;
  unitOfMeasure?: string;
  description?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  categoryId?: string;
  location?: string;
}
