import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, ExpenseRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseRequestDto } from './dto/create-expense-request.dto';
import { UpdateExpenseRequestStatusDto } from './dto/update-expense-request-status.dto';

const EXPENSE_REQUEST_INCLUDE = {
  employee: true,
  documents: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 } } },
};

// REIMBURSED only ever follows APPROVED, and REJECTED/REIMBURSED are both
// terminal — same single-level-approval shape as everywhere else in this
// codebase (Invoice's DRAFT -> APPROVED -> PAID, HSE's corrective actions).
const ALLOWED_TRANSITIONS: Record<ExpenseRequestStatus, ExpenseRequestStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['REIMBURSED'],
  REJECTED: [],
  REIMBURSED: [],
};

@Injectable()
export class ExpenseRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForEmployee(employeeId: string, dto: CreateExpenseRequestDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    return this.prisma.expenseRequest.create({
      data: {
        organizationId: dto.organizationId,
        employeeId,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        incurredOn: new Date(dto.incurredOn),
        description: dto.description,
      },
    });
  }

  findForEmployee(employeeId: string, filters: { status?: ExpenseRequestStatus } = {}) {
    return this.prisma.expenseRequest.findMany({
      where: { employeeId, status: filters.status },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll(
    filters: {
      organizationId?: string;
      employeeId?: string;
      status?: ExpenseRequestStatus;
      category?: ExpenseCategory;
    } = {},
  ) {
    return this.prisma.expenseRequest.findMany({
      where: {
        organizationId: filters.organizationId,
        employeeId: filters.employeeId,
        status: filters.status,
        category: filters.category,
      },
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const expenseRequest = await this.prisma.expenseRequest.findUnique({
      where: { id },
      include: EXPENSE_REQUEST_INCLUDE,
    });
    if (!expenseRequest) {
      throw new NotFoundException(`Expense request ${id} not found`);
    }
    return expenseRequest;
  }

  async updateStatus(id: string, dto: UpdateExpenseRequestStatusDto, decidedById: string) {
    const expenseRequest = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[expenseRequest.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move expense request from ${expenseRequest.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    return this.prisma.expenseRequest.update({
      where: { id },
      data: {
        status: dto.status,
        decidedById,
        decisionComment: dto.decisionComment,
        decidedAt: dto.status === 'APPROVED' || dto.status === 'REJECTED' ? new Date() : expenseRequest.decidedAt,
        reimbursedAt: dto.status === 'REIMBURSED' ? new Date() : undefined,
      },
      include: EXPENSE_REQUEST_INCLUDE,
    });
  }
}
