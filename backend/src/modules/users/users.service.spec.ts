import { NotFoundException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: MockPrisma;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
  });

  const user = { id: 'user-1', email: 'a@b.com', role: { id: 'role-1', name: 'admin' } };

  describe('findAll', () => {
    it('delegates straight to prisma.user.findMany with no filters by default', async () => {
      const users = [user];
      prisma.user.findMany.mockResolvedValue(users as never);

      const result = await service.findAll({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: undefined, isActive: undefined } }),
      );
      expect(result).toEqual(users);
    });

    it('filters by a single role name when given', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ role: 'document_control' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ role: { name: { in: ['document_control'] } } }) }),
      );
    });

    it('filters by multiple role names when given an array', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ role: ['document_control', 'admin'] });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: { name: { in: ['document_control', 'admin'] } } }),
        }),
      );
    });

    it('filters by isActive when given', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ isActive: false });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: false }) }),
      );
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the user (with role) when found', async () => {
      prisma.user.findUnique.mockResolvedValue(user as never);

      await expect(service.findOne('user-1')).resolves.toEqual(user);
    });
  });
});
