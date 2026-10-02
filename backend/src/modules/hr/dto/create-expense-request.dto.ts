import { ExpenseCategory } from '@prisma/client';

export class CreateExpenseRequestDto {
  organizationId!: string;
  category!: ExpenseCategory;
  amount!: number;
  incurredOn!: string;
  description?: string;
}
