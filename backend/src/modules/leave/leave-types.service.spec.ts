import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { DEFAULT_LEAVE_TYPES, LeaveTypesService } from './leave-types.service';

const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '5.20.0' });

describe('LeaveTypesService', () => {
  let prisma: MockPrisma;
  let service: LeaveTypesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LeaveTypesService(prisma);
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' } as never);
  });

  it('lists the types people can choose, or every type for HR', async () => {
    prisma.leaveType.findMany.mockResolvedValue([]);

    await service.findAll({ organizationId: 'org-1' });
    await service.findAll({ includeInactive: true });

    expect(prisma.leaveType.findMany).toHaveBeenNthCalledWith(1, { where: { organizationId: 'org-1', active: true }, orderBy: { name: 'asc' } });
    expect(prisma.leaveType.findMany).toHaveBeenNthCalledWith(2, { where: { organizationId: undefined, active: undefined }, orderBy: { name: 'asc' } });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.leaveType.create.mockResolvedValue({ id: 't1' } as never);
    });

    it('saves a type with its yearly allowance', async () => {
      await service.create({ organizationId: 'org-1', name: ' Annual leave ', daysPerYear: 21, paid: false, allowBackdate: true });

      expect(prisma.leaveType.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Annual leave', daysPerYear: 21, paid: false, allowBackdate: true },
      });
    });

    it('defaults to paid, no backdating and no limit', async () => {
      await service.create({ organizationId: 'org-1', name: 'Unpaid', daysPerYear: '' as never });

      expect(prisma.leaveType.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Unpaid', daysPerYear: null, paid: true, allowBackdate: false },
      });
      await service.create({ organizationId: 'org-1', name: 'Other' });
      expect(prisma.leaveType.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ daysPerYear: null }) });
    });

    it.each([
      [{ name: '  ' }, 'name is required'],
      [{ name: 'A', daysPerYear: 0 }, 'daysPerYear must be a whole number from 1 to 366'],
      [{ name: 'A', daysPerYear: 367 }, 'daysPerYear must be a whole number from 1 to 366'],
      [{ name: 'A', daysPerYear: 1.5 }, 'daysPerYear must be a whole number from 1 to 366'],
    ])('refuses %j', async (extra, message) => {
      await expect(service.create({ organizationId: 'org-1', ...extra })).rejects.toThrow(message);
      expect(prisma.leaveType.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.create({ organizationId: 'nope', name: 'A' })).rejects.toThrow(NotFoundException);
    });

    it('names the type in a duplicate, and rethrows anything else', async () => {
      prisma.leaveType.create.mockRejectedValueOnce(prismaError('P2002')).mockRejectedValueOnce(prismaError('P2003')).mockRejectedValueOnce(new Error('boom'));

      await expect(service.create({ organizationId: 'org-1', name: 'Annual' })).rejects.toThrow(ConflictException);
      await expect(service.create({ organizationId: 'org-1', name: 'Annual' })).rejects.toThrow('x');
      await expect(service.create({ organizationId: 'org-1', name: 'Annual' })).rejects.toThrow('boom');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.leaveType.update.mockResolvedValue({ id: 't1' } as never);
    });

    it('changes only what was sent', async () => {
      await service.update('t1', { name: ' New ', daysPerYear: 30, paid: false, allowBackdate: true, active: false });
      await service.update('t1', { daysPerYear: null });
      await service.update('t1', {});

      expect(prisma.leaveType.update).toHaveBeenNthCalledWith(1, {
        where: { id: 't1' },
        data: { name: 'New', daysPerYear: 30, paid: false, allowBackdate: true, active: false },
      });
      expect(prisma.leaveType.update).toHaveBeenNthCalledWith(2, { where: { id: 't1' }, data: { daysPerYear: null } });
      expect(prisma.leaveType.update).toHaveBeenNthCalledWith(3, { where: { id: 't1' }, data: {} });
    });

    it('refuses a blank name and a bad allowance', async () => {
      await expect(service.update('t1', { name: ' ' })).rejects.toThrow('name cannot be blank');
      await expect(service.update('t1', { daysPerYear: 0 })).rejects.toThrow(BadRequestException);
    });

    it('404s for an unknown type, 409s for a duplicate name, and rethrows anything else', async () => {
      prisma.leaveType.update.mockRejectedValueOnce(prismaError('P2025')).mockRejectedValueOnce(prismaError('P2002')).mockRejectedValueOnce(new Error('boom'));

      await expect(service.update('x', {})).rejects.toThrow(NotFoundException);
      await expect(service.update('t1', { name: 'Dup' })).rejects.toThrow(ConflictException);
      await expect(service.update('t1', {})).rejects.toThrow('boom');
    });
  });

  describe('createDefaults', () => {
    it('adds the standard types the organization lacks, then lists them all', async () => {
      prisma.leaveType.createMany.mockResolvedValue({ count: 7 });
      prisma.leaveType.findMany.mockResolvedValue([{ id: 't1' }] as never);

      const result = await service.createDefaults('org-1');

      expect(result).toEqual([{ id: 't1' }]);
      expect(prisma.leaveType.createMany).toHaveBeenCalledWith({
        data: DEFAULT_LEAVE_TYPES.map((type) => ({ ...type, organizationId: 'org-1' })),
        skipDuplicates: true,
      });
      expect(prisma.leaveType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1', active: undefined } }));
    });

    it('includes annual, sick and unpaid leave, the last without a limit', () => {
      expect(DEFAULT_LEAVE_TYPES.map((type) => type.name)).toEqual(expect.arrayContaining(['Annual leave', 'Sick leave', 'Unpaid leave']));
      expect(DEFAULT_LEAVE_TYPES.find((type) => type.name === 'Unpaid leave')).toMatchObject({ daysPerYear: null, paid: false });
    });

    it('404s for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.createDefaults('nope')).rejects.toThrow(NotFoundException);
      expect(prisma.leaveType.createMany).not.toHaveBeenCalled();
    });
  });
});
