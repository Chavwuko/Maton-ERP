import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  let prisma: MockPrisma;
  let service: MaintenanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MaintenanceService(prisma);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.workOrder.findMany with the given filters', async () => {
      const workOrders = [{ id: 'wo-1' }];
      prisma.workOrder.findMany.mockResolvedValue(workOrders as never);

      const result = await service.findAll({ organizationId: 'org-1', status: 'OPEN' });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', status: 'OPEN' }) }),
      );
      expect(result).toEqual(workOrders);
    });
  });

  describe('create', () => {
    it('404s when the asset does not exist', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ organizationId: 'org-1', assetId: 'missing', title: 'x' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects opening a work order against a DECOMMISSIONED asset', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', status: 'DECOMMISSIONED' } as never);

      await expect(
        service.create({ organizationId: 'org-1', assetId: 'a1', title: 'x' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the work order when the asset is usable', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', status: 'ACTIVE' } as never);
      prisma.workOrder.create.mockResolvedValue({ id: 'wo-1', status: 'OPEN' } as never);

      const result = await service.create({ organizationId: 'org-1', assetId: 'a1', title: 'x' }, 'user-1');

      expect(result).toEqual({ id: 'wo-1', status: 'OPEN' });
    });

    it('parses a provided dueDate into a Date', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', status: 'ACTIVE' } as never);
      prisma.workOrder.create.mockResolvedValue({ id: 'wo-1' } as never);

      await service.create(
        { organizationId: 'org-1', assetId: 'a1', title: 'x', dueDate: '2026-01-01T00:00:00.000Z' },
        'user-1',
      );

      expect(prisma.workOrder.create.mock.calls[0][0].data.dueDate).toBeInstanceOf(Date);
    });
  });

  describe('updateStatus', () => {
    it.each([
      ['OPEN', 'COMPLETED'],
      ['COMPLETED', 'IN_PROGRESS'],
      ['CANCELLED', 'OPEN'],
    ])('rejects %s -> %s', async (from, to) => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: from } as never);

      await expect(service.updateStatus('wo-1', { status: to as never })).rejects.toThrow(BadRequestException);
    });

    it('moving to IN_PROGRESS sets an ACTIVE asset to UNDER_MAINTENANCE', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: 'OPEN' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' } as never);
      prisma.asset.findUniqueOrThrow.mockResolvedValue({ id: 'a1', status: 'ACTIVE' } as never);

      await service.updateStatus('wo-1', { status: 'IN_PROGRESS' });

      expect(prisma.asset.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { status: 'UNDER_MAINTENANCE' },
      });
    });

    it('moving to IN_PROGRESS does not re-write an asset already UNDER_MAINTENANCE', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: 'OPEN' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' } as never);
      prisma.asset.findUniqueOrThrow.mockResolvedValue({ id: 'a1', status: 'UNDER_MAINTENANCE' } as never);

      await service.updateStatus('wo-1', { status: 'IN_PROGRESS' });

      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it('COMPLETED brings the asset back to ACTIVE once no other work order is active', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: 'IN_PROGRESS' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'COMPLETED', completedAt: new Date() } as never);
      prisma.asset.findUniqueOrThrow.mockResolvedValue({ id: 'a1', status: 'UNDER_MAINTENANCE' } as never);
      prisma.workOrder.count.mockResolvedValue(0);

      await service.updateStatus('wo-1', { status: 'COMPLETED' });

      expect(prisma.asset.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'ACTIVE' } });
    });

    it('COMPLETED leaves the asset UNDER_MAINTENANCE while another work order is still active', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: 'IN_PROGRESS' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'COMPLETED' } as never);
      prisma.asset.findUniqueOrThrow.mockResolvedValue({ id: 'a1', status: 'UNDER_MAINTENANCE' } as never);
      prisma.workOrder.count.mockResolvedValue(1);

      await service.updateStatus('wo-1', { status: 'COMPLETED' });

      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it('CANCELLED also brings the asset back to ACTIVE once no other work order is active', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: 'IN_PROGRESS' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'CANCELLED' } as never);
      prisma.asset.findUniqueOrThrow.mockResolvedValue({ id: 'a1', status: 'UNDER_MAINTENANCE' } as never);
      prisma.workOrder.count.mockResolvedValue(0);

      await service.updateStatus('wo-1', { status: 'CANCELLED' });

      expect(prisma.asset.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'ACTIVE' } });
    });

    it('never touches a DECOMMISSIONED asset regardless of outcome', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', assetId: 'a1', status: 'IN_PROGRESS' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', status: 'COMPLETED' } as never);
      prisma.asset.findUniqueOrThrow.mockResolvedValue({ id: 'a1', status: 'DECOMMISSIONED' } as never);
      prisma.workOrder.count.mockResolvedValue(0);

      await service.updateStatus('wo-1', { status: 'COMPLETED' });

      expect(prisma.asset.update).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('404s when the work order does not exist', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(null);

      await expect(service.assign('missing', { assignedToId: 'u1' })).rejects.toThrow(NotFoundException);
    });

    it('reassigns an existing work order', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({ id: 'wo-1', status: 'OPEN' } as never);
      prisma.workOrder.update.mockResolvedValue({ id: 'wo-1', assignedToId: 'u2' } as never);

      const result = await service.assign('wo-1', { assignedToId: 'u2' });

      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wo-1' }, data: { assignedToId: 'u2' } }),
      );
      expect(result).toEqual({ id: 'wo-1', assignedToId: 'u2' });
    });
  });
});
