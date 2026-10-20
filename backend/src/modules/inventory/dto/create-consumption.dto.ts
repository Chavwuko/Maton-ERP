// organizationId is taken from the item, never from the client. At least one
// of departmentId / projectId must say who the items are charged to.
export class CreateConsumptionDto {
  warehouseId!: string;
  itemId!: string;
  quantity!: number;
  date?: string;
  departmentId?: string;
  projectId?: string;
  issuedTo?: string;
  purpose?: string;
}
