import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { EmployeesService } from './employees.service';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: '5.20.0',
    meta: { target },
  });
}

describe('EmployeesService', () => {
  let prisma: MockPrisma;
  let service: EmployeesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmployeesService(prisma);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.employee.findMany with the given filters', async () => {
      const employees = [{ id: 'emp-1' }];
      prisma.employee.findMany.mockResolvedValue(employees as never);

      const result = await service.findAll({ organizationId: 'org-1', employmentStatus: 'ACTIVE' });

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', employmentStatus: 'ACTIVE' }) }),
      );
      expect(result).toEqual(employees);
    });
  });

  describe('findByUserId', () => {
    it('404s with a message pointing at "the current user" rather than an id', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findByUserId('user-1')).rejects.toThrow(/No employee record found/);
    });

    it('returns the employee when found', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', userId: 'user-1' } as never);

      await expect(service.findByUserId('user-1')).resolves.toEqual({ id: 'emp-1', userId: 'user-1' });
    });
  });

  describe('create', () => {
    it('a duplicate userId is reported as "already has an employee record"', async () => {
      prisma.employee.create.mockRejectedValue(p2002(['userId']));

      await expect(
        service.create({
          organizationId: 'org-1',
          userId: 'user-1',
          employeeNumber: 'EMP-001',
          jobTitle: 'x',
          hireDate: '2022-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(/already has an employee record/);
    });

    it('a duplicate employeeNumber is reported by number, distinctly from the userId case', async () => {
      prisma.employee.create.mockRejectedValue(p2002(['organizationId', 'employeeNumber']));

      await expect(
        service.create({
          organizationId: 'org-1',
          userId: 'user-2',
          employeeNumber: 'EMP-001',
          jobTitle: 'x',
          hireDate: '2022-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(/Employee number "EMP-001"/);
    });

    it('falls back to the employee-number message when P2002 has no meta.target', async () => {
      prisma.employee.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' }),
      );

      await expect(
        service.create({
          organizationId: 'org-1',
          userId: 'user-1',
          employeeNumber: 'EMP-001',
          jobTitle: 'x',
          hireDate: '2022-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(/Employee number "EMP-001"/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.employee.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({
          organizationId: 'org-1',
          userId: 'user-1',
          employeeNumber: 'EMP-001',
          jobTitle: 'x',
          hireDate: '2022-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('updateEmploymentStatus', () => {
    it('TERMINATED is a terminal status', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', employmentStatus: 'TERMINATED' } as never);

      await expect(service.updateEmploymentStatus('emp-1', { employmentStatus: 'ACTIVE' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows ACTIVE <-> ON_LEAVE', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', employmentStatus: 'ACTIVE' } as never);
      prisma.employee.update.mockResolvedValue({ id: 'emp-1', employmentStatus: 'ON_LEAVE' } as never);

      const result = await service.updateEmploymentStatus('emp-1', { employmentStatus: 'ON_LEAVE' });

      expect(result).toEqual({ id: 'emp-1', employmentStatus: 'ON_LEAVE' });
    });

    it('404s when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.updateEmploymentStatus('missing', { employmentStatus: 'ACTIVE' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
