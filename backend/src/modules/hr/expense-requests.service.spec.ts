import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { ExpenseRequestsService } from './expense-requests.service';

describe('ExpenseRequestsService', () => {
  let prisma: MockPrisma;
  let service: ExpenseRequestsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ExpenseRequestsService(prisma);
  });

  describe('createForEmployee', () => {
    it('rejects a non-positive amount', async () => {
      await expect(
        service.createForEmployee('emp-1', {
          organizationId: 'org-1',
          category: 'TRAVEL',
          amount: 0,
          incurredOn: '2026-06-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a PENDING request for the given employee', async () => {
      prisma.expenseRequest.create.mockResolvedValue({ id: 'exp-1', status: 'PENDING' } as never);

      await service.createForEmployee('emp-1', {
        organizationId: 'org-1',
        category: 'TRAVEL',
        amount: 150,
        incurredOn: '2026-06-01',
        description: 'Client visit taxi',
      });

      const data = prisma.expenseRequest.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        organizationId: 'org-1',
        employeeId: 'emp-1',
        category: 'TRAVEL',
        incurredOn: new Date('2026-06-01'),
        description: 'Client visit taxi',
      });
      expect(data.amount?.toString()).toBe('150');
    });
  });

  describe('findForEmployee', () => {
    it('scopes to the employee and forwards the status filter', async () => {
      prisma.expenseRequest.findMany.mockResolvedValue([] as never);

      await service.findForEmployee('emp-1', { status: 'APPROVED' });

      expect(prisma.expenseRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-1', status: 'APPROVED' } }),
      );
    });

    it('defaults to no status filter when called with no filters', async () => {
      prisma.expenseRequest.findMany.mockResolvedValue([] as never);

      await service.findForEmployee('emp-1');

      expect(prisma.expenseRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-1', status: undefined } }),
      );
    });
  });

  describe('findAll', () => {
    it('forwards every filter and includes the employee', async () => {
      prisma.expenseRequest.findMany.mockResolvedValue([] as never);

      await service.findAll({ organizationId: 'org-1', category: 'MEALS' });

      expect(prisma.expenseRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1', category: 'MEALS' }),
          include: { employee: true },
        }),
      );
    });

    it('defaults to no filters when called with no arguments', async () => {
      prisma.expenseRequest.findMany.mockResolvedValue([] as never);

      await service.findAll();

      expect(prisma.expenseRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: undefined, employeeId: undefined, status: undefined, category: undefined },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.expenseRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the request when found', async () => {
      prisma.expenseRequest.findUnique.mockResolvedValue({ id: 'exp-1', status: 'PENDING' } as never);

      await expect(service.findOne('exp-1')).resolves.toEqual({ id: 'exp-1', status: 'PENDING' });
    });
  });

  describe('updateStatus', () => {
    it('rejects an illegal transition', async () => {
      prisma.expenseRequest.findUnique.mockResolvedValue({ id: 'exp-1', status: 'REJECTED' } as never);

      await expect(service.updateStatus('exp-1', { status: 'APPROVED' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approves a PENDING request and stamps decidedAt/decidedById', async () => {
      prisma.expenseRequest.findUnique.mockResolvedValue({ id: 'exp-1', status: 'PENDING' } as never);
      prisma.expenseRequest.update.mockResolvedValue({ id: 'exp-1', status: 'APPROVED' } as never);

      await service.updateStatus('exp-1', { status: 'APPROVED', decisionComment: 'Looks good' }, 'user-1');

      expect(prisma.expenseRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-1' },
          data: expect.objectContaining({
            status: 'APPROVED',
            decidedById: 'user-1',
            decisionComment: 'Looks good',
            decidedAt: expect.any(Date),
            reimbursedAt: undefined,
          }),
        }),
      );
    });

    it('rejects a PENDING request and stamps decidedAt', async () => {
      prisma.expenseRequest.findUnique.mockResolvedValue({ id: 'exp-1', status: 'PENDING' } as never);
      prisma.expenseRequest.update.mockResolvedValue({ id: 'exp-1', status: 'REJECTED' } as never);

      await service.updateStatus('exp-1', { status: 'REJECTED' }, 'user-1');

      expect(prisma.expenseRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', decidedAt: expect.any(Date) }) }),
      );
    });

    it('marks an APPROVED request REIMBURSED and stamps reimbursedAt, leaving decidedAt alone', async () => {
      const decidedAt = new Date('2026-06-01T00:00:00.000Z');
      prisma.expenseRequest.findUnique.mockResolvedValue({ id: 'exp-1', status: 'APPROVED', decidedAt } as never);
      prisma.expenseRequest.update.mockResolvedValue({ id: 'exp-1', status: 'REIMBURSED' } as never);

      await service.updateStatus('exp-1', { status: 'REIMBURSED' }, 'user-1');

      expect(prisma.expenseRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REIMBURSED', reimbursedAt: expect.any(Date), decidedAt }),
        }),
      );
    });
  });
});
