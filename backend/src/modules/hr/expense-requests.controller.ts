import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ExpenseCategory, ExpenseRequestStatus } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { CreateExpenseRequestDto } from './dto/create-expense-request.dto';
import { UpdateExpenseRequestStatusDto } from './dto/update-expense-request-status.dto';
import { EmployeesService } from './employees.service';
import { ExpenseRequestsService } from './expense-requests.service';

// Reads are open to any authenticated user (matches Invoices — financial
// records other modules already expose this way); submitting a claim is
// self-service like /employees/me; deciding one (approve/reject/reimburse)
// is restricted to admin/hr. Receipts attach via the existing
// POST /documents (see CreateDocumentDto's expenseRequestId), not a
// bespoke upload route here.
@Controller('expense-requests')
export class ExpenseRequestsController {
  constructor(
    private readonly expenseRequestsService: ExpenseRequestsService,
    private readonly employeesService: EmployeesService,
  ) {}

  @Post('me')
  async createMine(@Body() dto: CreateExpenseRequestDto, @Req() req: Request) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.expenseRequestsService.createForEmployee(employee.id, dto);
  }

  @Get('me')
  async findMine(@Req() req: Request, @Query('status') status?: ExpenseRequestStatus) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.expenseRequestsService.findForEmployee(employee.id, { status });
  }

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: ExpenseRequestStatus,
    @Query('category') category?: ExpenseCategory,
  ) {
    return this.expenseRequestsService.findAll({ organizationId, employeeId, status, category });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expenseRequestsService.findOne(id);
  }

  @Roles('admin', 'hr')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateExpenseRequestStatusDto, @Req() req: Request) {
    return this.expenseRequestsService.updateStatus(id, dto, req.user!.id);
  }
}
