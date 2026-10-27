import { WorkOrderStatus } from '@prisma/client';

export class UpdateWorkOrderStatusDto {
  status!: WorkOrderStatus;
  // Only when completing: what was done, and what it cost.
  completionNotes?: string;
  cost?: number;
}
