import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { DepartmentsService } from './departments.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' });
}

function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '5.20.0' });
}

describe('DepartmentsService', () => {
  let prisma: MockPrisma;
  let service: DepartmentsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DepartmentsService(prisma);
  });

  const department = { id: 'dept-1', organizationId: 'org-1', code: 'FIN', name: 'Finance' };

  describe('findAll', () => {
    it('delegates straight to prisma.department.findMany, filtered by organizationId', async () => {
      const departments = [department];
      prisma.department.findMany.mockResolvedValue(departments as never);

      const result = await service.findAll({ organizationId: 'org-1' });

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result).toEqual(departments);
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the department when found', async () => {
      prisma.department.findUnique.mockResolvedValue(department as never);

      await expect(service.findOne('dept-1')).resolves.toEqual(department);
    });
  });

  describe('create', () => {
    it('turns a P2002 conflict into a ConflictException naming the code', async () => {
      prisma.department.create.mockRejectedValue(p2002());

      await expect(
        service.create({ organizationId: 'org-1', code: 'FIN', name: 'Dup' }),
      ).rejects.toThrow(/FIN/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.department.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({ organizationId: 'org-1', code: 'FIN', name: 'Finance' }),
      ).rejects.toThrow('boom');
    });

    it('creates the department when the code is free', async () => {
      prisma.department.create.mockResolvedValue(department as never);

      const result = await service.create({ organizationId: 'org-1', code: 'FIN', name: 'Finance' });

      expect(result).toEqual(department);
    });
  });

  describe('update', () => {
    it('turns a P2002 conflict into a ConflictException naming the code', async () => {
      prisma.department.update.mockRejectedValue(p2002());

      await expect(service.update('dept-1', { code: 'FIN' })).rejects.toThrow(/FIN/);
    });

    it('turns a P2025 not-found into a NotFoundException', async () => {
      prisma.department.update.mockRejectedValue(p2025());

      await expect(service.update('missing', { name: 'Finance' })).rejects.toThrow(NotFoundException);
    });

    it('rethrows unrelated errors', async () => {
      prisma.department.update.mockRejectedValue(new Error('boom'));

      await expect(service.update('dept-1', { name: 'Finance' })).rejects.toThrow('boom');
    });

    it('updates the department', async () => {
      const updated = { ...department, name: 'Finance & Treasury' };
      prisma.department.update.mockResolvedValue(updated as never);

      const result = await service.update('dept-1', { name: 'Finance & Treasury' });

      expect(prisma.department.update).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        data: { name: 'Finance & Treasury' },
      });
      expect(result).toEqual(updated);
    });
  });
});
