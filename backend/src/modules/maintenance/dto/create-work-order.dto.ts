import { WorkOrderPriority, WorkOrderType } from '@prisma/client';

export class CreateWorkOrderDto {
  organizationId!: string;
  assetId!: string;
  title!: string;
  description?: string;
  type?: WorkOrderType;
  priority?: WorkOrderPriority;
  dueDate?: string;
  assignedToId?: string;
}
