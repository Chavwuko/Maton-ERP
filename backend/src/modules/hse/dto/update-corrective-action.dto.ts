import { CorrectiveActionStatus } from '@prisma/client';

export class UpdateCorrectiveActionDto {
  status?: CorrectiveActionStatus;
  description?: string;
  assignedToId?: string;
  dueDate?: string;
}
