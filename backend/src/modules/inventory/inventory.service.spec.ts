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

    it('404s for a soft-deleted item', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...item, deletedAt: new Date(), stockLevels: [] } as never);

      await expect(service.findItem('item-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the item (with per-warehouse stock levels) when found', async () => {
      const found = { ...item, stockLevels: [] };
      prisma.inventoryItem.findUnique.mockResolvedValue(found as never);

      await expect(service.findItem('item-1')).resolves.toEqual(found);
    });
  });

  describe('createItem', () => {
    const base = { organizationId: 'org-1', sku: 'BRG-6205', name: 'Bearing', unitOfMeasure: 'EA' };

    it('turns a P2002 conflict into a ConflictException naming the SKU', async () => {
      prisma.inventoryItem.create.mockRejectedValue(p2002());

      await expect(service.createItem({ ...base, name: 'Dup' }, 'user-1')).rejects.toThrow(/BRG-6205/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.inventoryItem.create.mockRejectedValue(new Error('boom'));

      await expect(service.createItem(base, 'user-1')).rejects.toThrow('boom');
    });

    it('creates the item when the SKU is free', async () => {
      prisma.inventoryItem.create.mockResolvedValue(item as never);

      const result = await service.createItem(base, 'user-1');

      expect(result).toEqual(item);
      expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
    });

    it('stores a starting unit cost when given', async () => {
      prisma.inventoryItem.create.mockResolvedValue(item as never);

      await service.createItem({ ...base, unitCost: 4.5 }, 'user-1');

      const data = (prisma.inventoryItem.create.mock.calls[0][0] as { data: { unitCost: Prisma.Decimal } }).data;
      expect(data.unitCost.toString()).toBe('4.5');
    });

    it('rejects a negative opening stock or unit cost', async () => {
      await expect(service.createItem({ ...base, openingStock: -1, openingWarehouseId: 'w1' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createItem({ ...base, unitCost: -1 }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('requires a warehouse when opening stock is given', async () => {
      await expect(service.createItem({ ...base, openingStock: 10 }, 'user-1')).rejects.toThrow(/openingWarehouseId/);
    });

    it('posts an OPENING ledger row for stock already on hand', async () => {
      prisma.inventoryItem.create.mockResolvedValue({ ...item, id: 'item-1' } as never);
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue(null);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.stockTransaction.create.mockResolvedValue({} as never);

      await service.createItem({ ...base, openingStock: 800, openingWarehouseId: 'wh-1' }, 'user-1');

      expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'OPENING',
          quantity: 800,
          balanceAfter: 800,
          warehouseId: 'wh-1',
          performedById: 'user-1',
        }),
      });
    });
  });

  describe('updateItem', () => {
    it('404s when the item does not exist', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.updateItem('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('updates the given fields', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...item, stockLevels: [] } as never);
      prisma.inventoryItem.update.mockResolvedValue({ ...item, name: 'New' } as never);

      await service.updateItem('item-1', { name: 'New', location: 'Rack A1' });

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' }, data: expect.objectContaining({ name: 'New', location: 'Rack A1' }) }),
      );
    });

    it('turns a P2002 conflict into a ConflictException naming the SKU', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...item, stockLevels: [] } as never);
      prisma.inventoryItem.update.mockRejectedValue(p2002());

      await expect(service.updateItem('item-1', { sku: 'TAKEN' })).rejects.toThrow(/TAKEN/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...item, stockLevels: [] } as never);
      prisma.inventoryItem.update.mockRejectedValue(new Error('boom'));

      await expect(service.updateItem('item-1', { name: 'x' })).rejects.toThrow('boom');
    });
  });

  describe('deleteItem', () => {
    it('refuses while any stock is on hand', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({
        ...item,
        stockLevels: [{ quantityOnHand: 2 }, { quantityOnHand: 1.5 }],
      } as never);

      await expect(service.deleteItem('item-1')).rejects.toThrow(/zero stock.*3.5 on hand/);
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('soft-deletes an item with no stock', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...item, stockLevels: [{ quantityOnHand: 0 }] } as never);
      prisma.inventoryItem.update.mockResolvedValue({} as never);

      await service.deleteItem('item-1');

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('categories', () => {
    it('findAllCategories is scoped to the organization', async () => {
      prisma.itemCategory.findMany.mockResolvedValue([] as never);

      await service.findAllCategories({ organizationId: 'org-1' });

      expect(prisma.itemCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('createCategory trims the name and creates it', async () => {
      prisma.itemCategory.create.mockResolvedValue({ id: 'c1' } as never);

      await service.createCategory({ organizationId: 'org-1', name: '  Electrical  ' });

      expect(prisma.itemCategory.create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', name: 'Electrical' } });
    });

    it('rejects a blank name', async () => {
      await expect(service.createCategory({ organizationId: 'org-1', name: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('409s on a duplicate name', async () => {
      prisma.itemCategory.create.mockRejectedValue(p2002());

      await expect(service.createCategory({ organizationId: 'org-1', name: 'Electrical' })).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated errors', async () => {
      prisma.itemCategory.create.mockRejectedValue(new Error('boom'));

      await expect(service.createCategory({ organizationId: 'org-1', name: 'Electrical' })).rejects.toThrow('boom');
    });
  });

  describe('getStockOverview', () => {
    const row = (overrides: Record<string, unknown>) => ({
      id: 'i1',
      unitCost: new Prisma.Decimal('4.50'),
      reorderPoint: 10,
      stockLevels: [],
      ...overrides,
    });

    it('totals stock across warehouses, values it at unit cost, and flags the reorder status', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        row({ id: 'ok', stockLevels: [{ quantityOnHand: 20 }, { quantityOnHand: 5 }] }),
        row({ id: 'low', stockLevels: [{ quantityOnHand: 10 }] }),
        row({ id: 'out', stockLevels: [{ quantityOnHand: 0 }] }),
        row({ id: 'noreorder', reorderPoint: null, stockLevels: [{ quantityOnHand: 1 }] }),
      ] as never);

      const result = await service.getStockOverview({ organizationId: 'org-1' });

      expect(result.map((r) => [r.id, r.status, r.totalOnHand])).toEqual([
        ['ok', 'IN_STOCK', 25],
        ['low', 'LOW_STOCK', 10],
        ['out', 'OUT_OF_STOCK', 0],
        ['noreorder', 'IN_STOCK', 1],
      ]);
      expect(result[0].stockValue.toString()).toBe('112.5');
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', deletedAt: null } }),
      );
    });
  });

  describe('findTransactions', () => {
    it('forwards every filter to prisma.stockTransaction.findMany', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([] as never);

      await service.findTransactions({ itemId: 'i1', warehouseId: 'w1', workOrderId: 'wo1', type: 'ISSUE' });

      expect(prisma.stockTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ itemId: 'i1', warehouseId: 'w1', workOrderId: 'wo1', type: 'ISSUE' }),
        }),
      );
    });

    it('turns from/to into an inclusive createdAt range', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([] as never);

      await service.findTransactions({ from: '2026-06-01', to: '2026-06-30' });

      expect(prisma.stockTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30T23:59:59.999Z') },
          }),
        }),
      );
    });

    it('supports a half-open range', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([] as never);

      await service.findTransactions({ from: '2026-06-01' });
      await service.findTransactions({ to: '2026-06-30' });

      const calls = prisma.stockTransaction.findMany.mock.calls.map(
        (c) => (c[0] as { where: { createdAt: { gte?: Date; lte?: Date } } }).where.createdAt,
      );
      expect(calls[0]).toEqual({ gte: new Date('2026-06-01'), lte: undefined });
      expect(calls[1]).toEqual({ gte: undefined, lte: new Date('2026-06-30T23:59:59.999Z') });
    });
  });

  describe('adjustStock', () => {
    const dto = { itemId: 'i1', warehouseId: 'w1', countedQuantity: 12, reason: 'Physical count' };

    it('requires a reason', async () => {
      await expect(service.adjustStock({ ...dto, reason: '  ' }, 'user-1')).rejects.toThrow(/reason is required/);
    });

    it('rejects a negative count', async () => {
      await expect(service.adjustStock({ ...dto, countedQuantity: -1 }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a count equal to the system quantity', async () => {
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 12 } as never);

      await expect(service.adjustStock(dto, 'user-1')).rejects.toThrow(/nothing to adjust/);
    });

    it('posts the signed difference with the reason as the note', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: 15 } as never);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.stockTransaction.create.mockResolvedValue({ id: 'txn' } as never);

      await service.adjustStock(dto, 'user-1');

      expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'ADJUSTMENT', quantity: -3, balanceAfter: 12, notes: 'Physical count' }),
      });
    });

    it('treats a missing stock level as zero', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(item as never);
      prisma.warehouse.findUnique.mockResolvedValue(warehouse as never);
      prisma.stockLevel.findUnique.mockResolvedValue(null);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.stockTransaction.create.mockResolvedValue({} as never);

      await service.adjustStock(dto, 'user-1');

      expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ quantity: 12, balanceAfter: 12 }),
      });
    });
  });

  describe('purchases', () => {
    const dto = { warehouseId: 'wh-1', itemId: 'item-1', vendorId: 'v1', quantity: 10, unitCost: 8 };
    const liveItem = { id: 'item-1', sku: 'BRG', organizationId: 'org-1', unitCost: new Prisma.Decimal('4'), deletedAt: null };

    function arrange(opts: { onHand?: number; unitCost?: string } = {}) {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...liveItem, unitCost: new Prisma.Decimal(opts.unitCost ?? '4') } as never);
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', organizationId: 'org-1' } as never);
      prisma.warehouse.findUnique.mockResolvedValue({ ...warehouse, organizationId: 'org-1' } as never);
      prisma.stockLevel.findMany.mockResolvedValue([{ quantityOnHand: opts.onHand ?? 10 }] as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: opts.onHand ?? 10 } as never);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.purchase.create.mockResolvedValue({ id: 'p1' } as never);
      prisma.inventoryItem.update.mockResolvedValue({} as never);
      prisma.stockTransaction.create.mockResolvedValue({} as never);
    }

    it('rejects a non-positive quantity or a negative cost', async () => {
      await expect(service.recordPurchase({ ...dto, quantity: 0 }, 'u')).rejects.toThrow(/quantity must be positive/);
      await expect(service.recordPurchase({ ...dto, unitCost: -1 }, 'u')).rejects.toThrow(/unitCost cannot be negative/);
    });

    it('404s for an unknown or deleted item', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      await expect(service.recordPurchase(dto, 'u')).rejects.toThrow(NotFoundException);

      prisma.inventoryItem.findUnique.mockResolvedValue({ ...liveItem, deletedAt: new Date() } as never);
      await expect(service.recordPurchase(dto, 'u')).rejects.toThrow(NotFoundException);
    });

    it('404s for an unknown vendor and rejects a vendor from another organization', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(liveItem as never);
      prisma.vendor.findUnique.mockResolvedValue(null);
      await expect(service.recordPurchase(dto, 'u')).rejects.toThrow(/Vendor/);

      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', organizationId: 'other' } as never);
      await expect(service.recordPurchase(dto, 'u')).rejects.toThrow(/different organizations/);
    });

    it('recalculates the weighted-average cost: (10 x 4 + 10 x 8) / 20 = 6', async () => {
      arrange({ onHand: 10, unitCost: '4' });

      await service.recordPurchase({ ...dto, poNumber: 'PO-1', date: '2026-06-15' }, 'user-1');

      const itemUpdate = prisma.inventoryItem.update.mock.calls[0][0] as { data: { unitCost: Prisma.Decimal } };
      expect(itemUpdate.data.unitCost.toString()).toBe('6');
      const purchase = (prisma.purchase.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(purchase).toMatchObject({ organizationId: 'org-1', quantity: 10, receivedById: 'user-1', poNumber: 'PO-1' });
      expect((purchase.total as Prisma.Decimal).toString()).toBe('80');
      expect(purchase.date).toEqual(new Date('2026-06-15'));
    });

    it('takes the purchase cost as-is when nothing was on hand, and defaults the date to now', async () => {
      arrange({ onHand: 0, unitCost: '0' });
      prisma.stockLevel.findMany.mockResolvedValue([] as never);
      prisma.stockLevel.findUnique.mockResolvedValue(null);

      await service.recordPurchase(dto, 'user-1');

      const itemUpdate = prisma.inventoryItem.update.mock.calls[0][0] as { data: { unitCost: Prisma.Decimal } };
      expect(itemUpdate.data.unitCost.toString()).toBe('8');
      expect((prisma.purchase.create.mock.calls[0][0] as { data: { date: Date } }).data.date).toBeInstanceOf(Date);
    });

    it('posts a RECEIPT ledger row referencing the purchase, with the new balance', async () => {
      arrange({ onHand: 10 });

      await service.recordPurchase(dto, 'user-1');

      expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'RECEIPT',
          quantity: 10,
          balanceAfter: 20,
          refType: 'PURCHASE',
          refId: 'p1',
          notes: 'PO -',
        }),
      });
    });

    it('lists live purchases filtered by organization/vendor/item/date', async () => {
      prisma.purchase.findMany.mockResolvedValue([] as never);

      await service.findPurchases({ organizationId: 'org-1', vendorId: 'v1', itemId: 'i1', from: '2026-06-01', to: '2026-06-30' });
      await service.findPurchases({});
      await service.findPurchases({ to: '2026-06-30' });

      expect((prisma.purchase.findMany.mock.calls[2][0] as { where: { date: unknown } }).where.date).toEqual({
        gte: undefined,
        lte: new Date('2026-06-30T23:59:59.999Z'),
      });
      expect(prisma.purchase.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            vendorId: 'v1',
            itemId: 'i1',
            deletedAt: null,
            date: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30T23:59:59.999Z') },
          },
        }),
      );
      expect((prisma.purchase.findMany.mock.calls[1][0] as { where: { date?: unknown } }).where.date).toBeUndefined();
    });

    describe('deletePurchase', () => {
      const purchase = { id: 'p1', itemId: 'item-1', warehouseId: 'wh-1', quantity: 10, deletedAt: null };

      it('404s when missing or already deleted', async () => {
        prisma.purchase.findUnique.mockResolvedValue(null);
        await expect(service.deletePurchase('p1', 'u')).rejects.toThrow(NotFoundException);

        prisma.purchase.findUnique.mockResolvedValue({ ...purchase, deletedAt: new Date() } as never);
        await expect(service.deletePurchase('p1', 'u')).rejects.toThrow(NotFoundException);
      });

      it('reverses the stock, posts a REVERSAL row, and soft-deletes', async () => {
        arrange({ onHand: 25 });
        prisma.purchase.findUnique.mockResolvedValue(purchase as never);
        prisma.purchase.update.mockResolvedValue({} as never);

        await service.deletePurchase('p1', 'user-1');

        expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            type: 'REVERSAL',
            quantity: -10,
            balanceAfter: 15,
            refType: 'PURCHASE_DELETED',
            refId: 'p1',
          }),
        });
        expect(prisma.purchase.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { deletedAt: expect.any(Date) } });
      });

      it('refuses when part of that stock has already been issued', async () => {
        arrange({ onHand: 4 });
        prisma.purchase.findUnique.mockResolvedValue(purchase as never);

        await expect(service.deletePurchase('p1', 'user-1')).rejects.toThrow(/Insufficient stock/);
        expect(prisma.purchase.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('consumptions', () => {
    const dto = { warehouseId: 'wh-1', itemId: 'item-1', quantity: 4, departmentId: 'd1' };
    const liveItem = { id: 'item-1', sku: 'BRG', organizationId: 'org-1', unitCost: new Prisma.Decimal('6.5'), deletedAt: null };

    function arrange(onHand = 10) {
      prisma.inventoryItem.findUnique.mockResolvedValue(liveItem as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'd1' } as never);
      prisma.project.findUnique.mockResolvedValue({ id: 'pr1' } as never);
      prisma.warehouse.findUnique.mockResolvedValue({ ...warehouse, organizationId: 'org-1' } as never);
      prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: onHand } as never);
      prisma.stockLevel.upsert.mockResolvedValue({} as never);
      prisma.consumption.create.mockResolvedValue({ id: 'c1' } as never);
      prisma.stockTransaction.create.mockResolvedValue({} as never);
    }

    it('rejects a non-positive quantity', async () => {
      await expect(service.recordConsumption({ ...dto, quantity: 0 }, 'u')).rejects.toThrow(/quantity must be positive/);
    });

    it('requires a department or a project to charge', async () => {
      await expect(service.recordConsumption({ ...dto, departmentId: undefined }, 'u')).rejects.toThrow(/department or a project/);
    });

    it('404s for an unknown item, department or project', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      await expect(service.recordConsumption(dto, 'u')).rejects.toThrow(/Inventory item/);

      arrange();
      prisma.department.findUnique.mockResolvedValue(null);
      await expect(service.recordConsumption(dto, 'u')).rejects.toThrow(/Department/);

      arrange();
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.recordConsumption({ ...dto, departmentId: undefined, projectId: 'pr1' }, 'u')).rejects.toThrow(/Project/);
    });

    it('costs the issue at the current weighted-average cost and posts an ISSUE ledger row', async () => {
      arrange(10);

      await service.recordConsumption({ ...dto, issuedTo: 'A. Musa', purpose: 'Site work', date: '2026-06-15' }, 'user-1');

      const created = (prisma.consumption.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(created).toMatchObject({ organizationId: 'org-1', quantity: 4, issuedById: 'user-1', issuedTo: 'A. Musa', departmentId: 'd1' });
      expect((created.unitCost as Prisma.Decimal).toString()).toBe('6.5');
      expect((created.total as Prisma.Decimal).toString()).toBe('26');
      expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ISSUE',
          quantity: -4,
          balanceAfter: 6,
          refType: 'CONSUMPTION',
          refId: 'c1',
          notes: 'Site work',
        }),
      });
    });

    it('can be charged to a project alone, defaulting the date and note', async () => {
      arrange(10);

      await service.recordConsumption({ warehouseId: 'wh-1', itemId: 'item-1', quantity: 1, projectId: 'pr1' }, 'user-1');

      expect((prisma.consumption.create.mock.calls[0][0] as { data: { date: Date } }).data.date).toBeInstanceOf(Date);
      expect(prisma.stockTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ notes: 'Issued' }) });
    });

    it('refuses to issue more than is on hand', async () => {
      arrange(2);

      await expect(service.recordConsumption(dto, 'user-1')).rejects.toThrow(/Insufficient stock/);
      expect(prisma.consumption.create).not.toHaveBeenCalled();
    });

    it('lists live consumption filtered by every field', async () => {
      prisma.consumption.findMany.mockResolvedValue([] as never);

      await service.findConsumptions({ organizationId: 'org-1', departmentId: 'd1', projectId: 'pr1', itemId: 'i1', from: '2026-06-01' });

      expect(prisma.consumption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            departmentId: 'd1',
            projectId: 'pr1',
            itemId: 'i1',
            deletedAt: null,
            date: { gte: new Date('2026-06-01'), lte: undefined },
          },
        }),
      );
    });

    describe('deleteConsumption', () => {
      const consumption = { id: 'c1', itemId: 'item-1', warehouseId: 'wh-1', quantity: 4, deletedAt: null };

      it('404s when missing or already deleted', async () => {
        prisma.consumption.findUnique.mockResolvedValue(null);
        await expect(service.deleteConsumption('c1', 'u')).rejects.toThrow(NotFoundException);

        prisma.consumption.findUnique.mockResolvedValue({ ...consumption, deletedAt: new Date() } as never);
        await expect(service.deleteConsumption('c1', 'u')).rejects.toThrow(NotFoundException);
      });

      it('puts the stock back, posts a REVERSAL row, and soft-deletes', async () => {
        arrange(6);
        prisma.consumption.findUnique.mockResolvedValue(consumption as never);
        prisma.consumption.update.mockResolvedValue({} as never);

        await service.deleteConsumption('c1', 'user-1');

        expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            type: 'REVERSAL',
            quantity: 4,
            balanceAfter: 10,
            refType: 'ISSUE_DELETED',
            refId: 'c1',
          }),
        });
        expect(prisma.consumption.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { deletedAt: expect.any(Date) } });
      });
    });
  });

  describe('cross-organization guard', () => {
    it('refuses to move stock between an item and a warehouse of different organizations', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({ ...item, organizationId: 'org-1' } as never);
      prisma.warehouse.findUnique.mockResolvedValue({ ...warehouse, organizationId: 'org-2' } as never);

      await expect(
        service.recordTransaction({ itemId: 'i1', warehouseId: 'w1', type: 'RECEIPT', quantity: 1 }, 'user-1'),
      ).rejects.toThrow(/different organizations/);
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
