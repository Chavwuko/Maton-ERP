import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { InventoryService } from './inventory.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' });
}

describe('InventoryService', () => {
  let prisma: MockPrisma;
  let service: InventoryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new InventoryService(prisma);
  });

  const item = { id: 'item-1', sku: 'BRG-6205' };
  const warehouse = { id: 'wh-1', code: 'WH-MAIN' };

  describe('findAllWarehouses', () => {
    it('delegates straight to prisma.warehouse.findMany, filtered by organizationId', async () => {
      const warehouses = [warehouse];
      prisma.warehouse.findMany.mockResolvedValue(warehouses as never);

      const result = await service.findAllWarehouses({ organizationId: 'org-1' });

      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result).toEqual(warehouses);
    });
  });

  describe('findWarehouse', () => {
    it('404s when missing', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.findWarehouse('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the warehouse (with stock levels) when found', async () => {
      const found = { ...warehouse, stockLevels: [] };
      prisma.warehouse.findUnique.mockResolvedValue(found as never);

      await expect(service.findWarehouse('wh-1')).resolves.toEqual(found);
    });
  });

  describe('createWarehouse', () => {
    it('turns a P2002 conflict into a ConflictException naming the code', async () => {
      prisma.warehouse.create.mockRejectedValue(p2002());

      await expect(
        service.createWarehouse({ organizationId: 'org-1', code: 'WH-MAIN', name: 'Dup' }),
      ).rejects.toThrow(/WH-MAIN/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.warehouse.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createWarehouse({ organizationId: 'org-1', code: 'WH-MAIN', name: 'Main' }),
      ).rejects.toThrow('boom');
    });

    it('creates the warehouse when the code is free', async () => {
      prisma.warehouse.create.mockResolvedValue(warehouse as never);

      const result = await service.createWarehouse({ organizationId: 'org-1', code: 'WH-MAIN', name: 'Main' });

      expect(result).toEqual(warehouse);
    });
  });

  describe('findItem', () => {
    it('404s when missing', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.findItem('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the item (with per-warehouse stock levels) when found', async () => {
      const found = { ...item, stockLevels: [] };
      prisma.inventoryItem.findUnique.mockResolvedValue(found as never);

      await expect(service.findItem('item-1')).resolves.toEqual(found);
    });
  });

  describe('createItem', () => {
    it('turns a P2002 conflict into a ConflictException naming the SKU', async () => {
      prisma.inventoryItem.create.mockRejectedValue(p2002());

      await expect(
        service.createItem({ organizationId: 'org-1', sku: 'BRG-6205', name: 'Dup', unitOfMeasure: 'EA' }),
      ).rejects.toThrow(/BRG-6205/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.inventoryItem.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createItem({ organizationId: 'org-1', sku: 'BRG-6205', name: 'Bearing', unitOfMeasure: 'EA' }),
      ).rejects.toThrow('boom');
    });

    it('creates the item when the SKU is free', async () => {
      prisma.inventoryItem.create.mockResolvedValue(item as never);

      const result = await service.createItem({
        organizationId: 'org-1',
        sku: 'BRG-6205',
        name: 'Bearing',
        unitOfMeasure: 'EA',
      });

      expect(result).toEqual(item);
    });
  });

  describe('findTransactions', () => {
    it('forwards every filter to prisma.stockTransaction.findMany', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([] as never);

      await service.findTransactions({ itemId: 'i1', warehouseId: 'w1', workOrderId: 'wo1' });

      expect(prisma.stockTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { itemId: 'i1', warehouseId: 'w1', workOrderId: 'wo1' } }),
      );
    });
  });

  describe('recordTransaction', () => {
    it.each(['RECEIPT', 'ISSUE'] as const)('rejects a non-positive quantity for %s', async (type) => {
      await expect(
        service.recordTransaction({ itemId: 'i1', warehouseId: 'w1', type, quantity: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a zero quantity for ADJUSTMENT', async () => {
      await expect(
        service.recordTransaction({ itemId: 'i1', warehouseId: 'w1', type: 'ADJUSTMENT', quantity: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a negative quantity for ADJUSTMENT (a correction)', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 20 } as never);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.stockTransaction.create.mockResolvedValue({ id: 'txn-1', quantity: -5 } as never);

      const result = await service.recordTransaction(
        { itemId: 'i1', warehouseId: 'w1', type: 'ADJUSTMENT', quantity: -5 },
        'user-1',
      );

      expect(result).toEqual({ id: 'txn-1', quantity: -5 });
      expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantityOnHand: 15 } }),
      );
    });

    it('ISSUE stores a negated (signed) quantity', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 20 } as never);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.stockTransaction.create.mockResolvedValue({} as never);

      await service.recordTransaction({ itemId: 'i1', warehouseId: 'w1', type: 'ISSUE', quantity: 5 }, 'user-1');

      expect(prisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantity: -5, type: 'ISSUE' }) }),
      );
    });

    it('rejects when it would take the balance negative, naming item/warehouse/balance', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 3 } as never);

      await expect(
        service.recordTransaction({ itemId: 'i1', warehouseId: 'w1', type: 'ISSUE', quantity: 100 }, 'user-1'),
      ).rejects.toThrow(/BRG-6205 at WH-MAIN has 3 on hand, cannot apply -100/);
    });

    it('treats a missing StockLevel row as a zero balance', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue(null);

      await expect(
        service.recordTransaction({ itemId: 'i1', warehouseId: 'w1', type: 'ISSUE', quantity: 1 }, 'user-1'),
      ).rejects.toThrow(/has 0 on hand/);
    });

    it('404s when the item does not exist', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);

      await expect(
        service.recordTransaction({ itemId: 'missing', warehouseId: 'w1', type: 'RECEIPT', quantity: 1 }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the warehouse does not exist', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.recordTransaction({ itemId: 'i1', warehouseId: 'missing', type: 'RECEIPT', quantity: 1 }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transfer', () => {
    it('rejects a non-positive quantity', async () => {
      await expect(
        service.transfer({ itemId: 'i1', fromWarehouseId: 'w1', toWarehouseId: 'w2', quantity: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transferring a warehouse to itself', async () => {
      await expect(
        service.transfer({ itemId: 'i1', fromWarehouseId: 'w1', toWarehouseId: 'w1', quantity: 5 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies a negative delta at the source and a positive delta at the destination', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 10 } as never);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.stockTransaction.create
        .mockResolvedValueOnce({ id: 'out', quantity: -5 } as never)
        .mockResolvedValueOnce({ id: 'in', quantity: 5 } as never);

      const result = await service.transfer(
        { itemId: 'i1', fromWarehouseId: 'w1', toWarehouseId: 'w2', quantity: 5 },
        'user-1',
      );

      expect(result).toEqual({ out: { id: 'out', quantity: -5 }, in: { id: 'in', quantity: 5 } });
    });

    it('rejects when the source warehouse has insufficient stock', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 2 } as never);

      await expect(
        service.transfer({ itemId: 'i1', fromWarehouseId: 'w1', toWarehouseId: 'w2', quantity: 5 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllItems', () => {
    it('filters to items whose total stock across warehouses is under their reorderPoint', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: 'i1', reorderPoint: 10, stockLevels: [{ quantityOnHand: 3 }, { quantityOnHand: 4 }] },
        { id: 'i2', reorderPoint: 10, stockLevels: [{ quantityOnHand: 20 }] },
        { id: 'i3', reorderPoint: null, stockLevels: [{ quantityOnHand: 0 }] },
      ] as never);

      const result = await service.findAllItems({ organizationId: 'org-1', belowReorderPoint: true });

      expect(result.map((i: { id: string }) => i.id)).toEqual(['i1']);
    });

    it('returns everything unfiltered when belowReorderPoint is not requested', async () => {
      const items = [{ id: 'i1' }, { id: 'i2' }];
      prisma.inventoryItem.findMany.mockResolvedValue(items as never);

      const result = await service.findAllItems({ organizationId: 'org-1' });

      expect(result).toEqual(items);
    });
  });
});
