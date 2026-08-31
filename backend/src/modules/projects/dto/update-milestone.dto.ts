import { MilestoneStatus } from '@prisma/client';

export class UpdateMilestoneDto {
  status?: MilestoneStatus;
  name?: string;
  description?: string;
  dueDate?: string;
}
