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

    it('passes the new profile fields straight through, including a given dateOfBirth', async () => {
      prisma.employee.create.mockResolvedValue({ id: 'emp-1' } as never);

      await service.create({
        organizationId: 'org-1',
        userId: 'user-1',
        employeeNumber: 'EMP-001',
        jobTitle: 'x',
        hireDate: '2022-01-01T00:00:00.000Z',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        gender: 'MALE',
        employmentType: 'CONTRACT',
        grade: 'ENTRY',
        branch: 'Abuja Office',
      });

      expect(prisma.employee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          gender: 'MALE',
          employmentType: 'CONTRACT',
          grade: 'ENTRY',
          branch: 'Abuja Office',
        }),
      });
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

    it('moving to TERMINATED sets exitDate to the given date', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', employmentStatus: 'ACTIVE' } as never);
      prisma.employee.update.mockResolvedValue({ id: 'emp-1', employmentStatus: 'TERMINATED' } as never);

      await service.updateEmploymentStatus('emp-1', {
        employmentStatus: 'TERMINATED',
        exitDate: '2026-06-15T00:00:00.000Z',
      });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { employmentStatus: 'TERMINATED', exitDate: new Date('2026-06-15T00:00:00.000Z') },
      });
    });

    it('moving to TERMINATED without an explicit exitDate defaults to today', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', employmentStatus: 'ACTIVE' } as never);
      prisma.employee.update.mockResolvedValue({ id: 'emp-1', employmentStatus: 'TERMINATED' } as never);

      await service.updateEmploymentStatus('emp-1', { employmentStatus: 'TERMINATED' });

      const call = prisma.employee.update.mock.calls[0][0] as { data: { exitDate: Date } };
      expect(call.data.exitDate).toBeInstanceOf(Date);
    });

    it('moving to ACTIVE/ON_LEAVE never sets exitDate', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', employmentStatus: 'ACTIVE' } as never);
      prisma.employee.update.mockResolvedValue({ id: 'emp-1', employmentStatus: 'ON_LEAVE' } as never);

      await service.updateEmploymentStatus('emp-1', { employmentStatus: 'ON_LEAVE' });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { employmentStatus: 'ON_LEAVE', exitDate: undefined },
      });
    });
  });

  describe('update', () => {
    it('404s when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { jobTitle: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('updates the given profile fields', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' } as never);
      prisma.employee.update.mockResolvedValue({ id: 'emp-1', jobTitle: 'Site Supervisor' } as never);

      const result = await service.update('emp-1', {
        jobTitle: 'Site Supervisor',
        gender: 'FEMALE',
        employmentType: 'FULL_TIME',
        grade: 'SENIOR',
        branch: 'Lagos HQ',
        dateOfBirth: '1990-05-01T00:00:00.000Z',
      });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: {
          jobTitle: 'Site Supervisor',
          managerId: undefined,
          dateOfBirth: new Date('1990-05-01T00:00:00.000Z'),
          gender: 'FEMALE',
          employmentType: 'FULL_TIME',
          grade: 'SENIOR',
          branch: 'Lagos HQ',
        },
      });
      expect(result).toEqual({ id: 'emp-1', jobTitle: 'Site Supervisor' });
    });

    it('leaves dateOfBirth alone when not given', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' } as never);
      prisma.employee.update.mockResolvedValue({ id: 'emp-1' } as never);

      await service.update('emp-1', { jobTitle: 'x' });

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dateOfBirth: undefined }) }),
      );
    });
  });

  describe('getDashboard', () => {
    const employee = (overrides: Record<string, unknown>) => ({
      hireDate: new Date('2020-01-01'),
      exitDate: null,
      dateOfBirth: null,
      gender: null,
      employmentType: null,
      grade: null,
      branch: null,
      jobTitle: 'Operations Manager',
      user: { department: null },
      ...overrides,
    });

    it('counts totals and every fixed-category breakdown, including zero-count categories', async () => {
      const realNow = Date;
      const fixedNow = new realNow('2026-06-15T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      prisma.employee.findMany.mockResolvedValue([
        employee({
          hireDate: new Date('2026-05-01'), // this quarter + this year
          gender: 'FEMALE',
          employmentType: 'FULL_TIME',
          grade: 'SENIOR',
          branch: 'Lagos HQ',
          dateOfBirth: new Date('1990-01-01'), // 36 -> 35-44
          user: { department: { name: 'Finance' } },
        }),
        employee({
          hireDate: new Date('2019-01-01'),
          exitDate: new Date('2026-05-01'), // this quarter + this year
        }),
      ] as never);

      const result = await service.getDashboard({});

      expect(result.totalEmployees).toBe(2);
      expect(result.newHiresThisYear).toBe(1);
      expect(result.joiningThisQuarter).toBe(1);
      expect(result.exitsThisYear).toBe(1);
      expect(result.relievingThisQuarter).toBe(1);

      expect(result.byGender).toEqual(
        expect.arrayContaining([
          { label: 'MALE', count: 0 },
          { label: 'FEMALE', count: 1 },
          { label: 'OTHER', count: 0 },
          { label: 'Unknown', count: 1 },
        ]),
      );
      expect(result.byAgeRange).toEqual(
        expect.arrayContaining([
          { label: '35-44', count: 1 },
          { label: 'Unknown', count: 1 },
        ]),
      );
      expect(result.byDepartment).toEqual(
        expect.arrayContaining([
          { label: 'Finance', count: 1 },
          { label: 'Unassigned', count: 1 },
        ]),
      );
      expect(result.byDesignation).toEqual([{ label: 'Operations Manager', count: 2 }]);

      jest.useRealTimers();
    });

    it('buckets every age range, and treats a not-yet-occurred birthday this year as one year younger', async () => {
      const fixedNow = new Date('2026-06-15T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      prisma.employee.findMany.mockResolvedValue([
        employee({ dateOfBirth: new Date('2005-01-01') }), // 21 -> Under 25
        employee({ dateOfBirth: new Date('1995-01-01') }), // 31 -> 25-34
        employee({ dateOfBirth: new Date('1980-01-01') }), // 46 -> 45-54
        employee({ dateOfBirth: new Date('1960-01-01') }), // 66 -> 55+
        // Birthday is Dec 1 — hasn't happened yet relative to the fixed
        // "now" of June 15, so this counts as 35 (35-44) rather than 36.
        employee({ dateOfBirth: new Date('1990-12-01') }),
        // Birthday falls in the same month as "now" (June) — exercises the
        // same-month comparison branch specifically, both ways: day 1 has
        // already passed (birthday occurred), day 20 has not (birthday
        // pending), so this year's age hasn't ticked over for the second one.
        employee({ dateOfBirth: new Date('1990-06-01') }),
        employee({ dateOfBirth: new Date('1990-06-20') }),
      ] as never);

      const result = await service.getDashboard({});

      expect(result.byAgeRange).toEqual(
        expect.arrayContaining([
          { label: 'Under 25', count: 1 },
          { label: '25-34', count: 1 },
          { label: '35-44', count: 3 },
          { label: '45-54', count: 1 },
          { label: '55+', count: 1 },
        ]),
      );

      jest.useRealTimers();
    });

    it('filters by organizationId when given', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await service.getDashboard({ organizationId: 'org-1' });

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });
});
