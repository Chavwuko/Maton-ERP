import { WorkOrderStatus } from '@prisma/client';

export class UpdateWorkOrderStatusDto {
  status!: WorkOrderStatus;
}
