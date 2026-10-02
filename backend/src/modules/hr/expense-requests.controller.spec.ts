import { ExpenseRequestsController } from './expense-requests.controller';
import { ExpenseRequestsService } from './expense-requests.service';
import { EmployeesService } from './employees.service';

describe('ExpenseRequestsController', () => {
  let expenseRequestsService: jest.Mocked<ExpenseRequestsService>;
  let employeesService: jest.Mocked<EmployeesService>;
  let controller: ExpenseRequestsController;

  beforeEach(() => {
    expenseRequestsService = {
      createForEmployee: jest.fn(),
      findForEmployee: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<ExpenseRequestsService>;
    employeesService = { findByUserId: jest.fn() } as unknown as jest.Mocked<EmployeesService>;
    controller = new ExpenseRequestsController(expenseRequestsService, employeesService);
  });

  const req = (userId: string) => ({ user: { id: userId } }) as never;

  it("createMine resolves the caller's own employee record then creates the request", async () => {
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);
    const dto = { organizationId: 'org-1', category: 'TRAVEL' as never, amount: 100, incurredOn: '2026-06-01' };

    await controller.createMine(dto, req('user-1'));

    expect(employeesService.findByUserId).toHaveBeenCalledWith('user-1');
    expect(expenseRequestsService.createForEmployee).toHaveBeenCalledWith('emp-1', dto);
  });

  it("findMine forwards the status filter for the caller's own employee record", async () => {
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);

    await controller.findMine(req('user-1'), 'APPROVED' as never);

    expect(expenseRequestsService.findForEmployee).toHaveBeenCalledWith('emp-1', { status: 'APPROVED' });
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'emp-1', 'PENDING' as never, 'MEALS' as never);

    expect(expenseRequestsService.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      employeeId: 'emp-1',
      status: 'PENDING',
      category: 'MEALS',
    });
  });

  it('findOne delegates the id', () => {
    controller.findOne('exp-1');
    expect(expenseRequestsService.findOne).toHaveBeenCalledWith('exp-1');
  });

  it('updateStatus delegates the id, dto, and req.user.id', () => {
    const dto = { status: 'APPROVED' as never };
    controller.updateStatus('exp-1', dto, req('user-1'));
    expect(expenseRequestsService.updateStatus).toHaveBeenCalledWith('exp-1', dto, 'user-1');
  });
});
