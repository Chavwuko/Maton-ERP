import { ExpenseRequestStatus } from '@prisma/client';

export class UpdateExpenseRequestStatusDto {
  status!: ExpenseRequestStatus;
  decisionComment?: string;
}
