import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  let prisma: MockPrisma;
  let service: AssetsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AssetsService(prisma);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.asset.findMany with the given filters', async () => {
      const assets = [{ id: 'a1' }];
      prisma.asset.findMany.mockResolvedValue(assets as never);

      const result = await service.findAll({ organizationId: 'org-1', status: 'ACTIVE', projectId: 'p1' });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'ACTIVE', projectId: 'p1' } }),
      );
      expect(result).toEqual(assets);
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the asset (with work orders) when found', async () => {
      const found = { id: 'a1', workOrders: [] };
      prisma.asset.findUnique.mockResolvedValue(found as never);

      await expect(service.findOne('a1')).resolves.toEqual(found);
    });
  });

  describe('create', () => {
    it('turns a P2002 conflict into a ConflictException naming the tag', async () => {
      prisma.asset.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' }),
      );

      await expect(
        service.create({ organizationId: 'org-1', assetTag: 'PUMP-001', name: 'Pump', category: 'x' }),
      ).rejects.toThrow(/PUMP-001/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.asset.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({ organizationId: 'org-1', assetTag: 'PUMP-001', name: 'Pump', category: 'x' }),
      ).rejects.toThrow('boom');
    });
  });
});
