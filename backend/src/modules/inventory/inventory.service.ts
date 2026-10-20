import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockTransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateConsumptionDto } from './dto/create-consumption.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

// Quantities are Float columns; rounding after every operation keeps float
// drift from ever accumulating in a balance.
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const money = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n).toDecimalPlaces(2);

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Warehouses ---------------------------------------------------------

  findAllWarehouses(filters: { organizationId?: string }) {
    return this.prisma.warehouse.findMany({
      where: { organizationId: filters.organizationId },
      orderBy: { code: 'asc' },
    });
  }

  async findWarehouse(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { stockLevels: { include: { item: true } } },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }
    return warehouse;
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    try {
      return await this.prisma.warehouse.create({ data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Warehouse code "${dto.code}" already exists in this organization`);
      }
      throw err;
    }
  }

  // --- Item categories -------------------------------------------------------

  findAllCategories(filters: { organizationId?: string }) {
    return this.prisma.itemCategory.findMany({
      where: { organizationId: filters.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateItemCategoryDto) {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Category name is required');
    }
    try {
      return await this.prisma.itemCategory.create({ data: { organizationId: dto.organizationId, name } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category "${name}" already exists in this organization`);
      }
      throw err;
    }
  }

  // --- Inventory items -----------------------------------------------------

  async findAllItems(filters: { organizationId?: string; belowReorderPoint?: boolean }) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: filters.organizationId, deletedAt: null },
      include: { stockLevels: true, category: true },
      orderBy: { sku: 'asc' },
    });

    if (!filters.belowReorderPoint) {
      return items;
    }

    return items.filter((item) => {
      if (item.reorderPoint == null) return false;
      const onHand = item.stockLevels.reduce((sum, level) => sum + level.quantityOnHand, 0);
      return onHand < item.reorderPoint;
    });
  }

  async findItem(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { stockLevels: { include: { warehouse: true } }, category: true },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }
    return item;
  }

  async createItem(dto: CreateInventoryItemDto, performedById: string) {
    const opening = dto.openingStock ? round3(dto.openingStock) : 0;
    if (opening < 0) {
      throw new BadRequestException('openingStock cannot be negative');
    }
    if (opening > 0 && !dto.openingWarehouseId) {
      throw new BadRequestException('openingWarehouseId is required when openingStock is given');
    }
    if (dto.unitCost !== undefined && dto.unitCost < 0) {
      throw new BadRequestException('unitCost cannot be negative');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            organizationId: dto.organizationId,
            sku: dto.sku,
            name: dto.name,
            unitOfMeasure: dto.unitOfMeasure,
            description: dto.description,
            reorderPoint: dto.reorderPoint,
            reorderQuantity: dto.reorderQuantity,
            categoryId: dto.categoryId,
            location: dto.location,
            unitCost: dto.unitCost !== undefined ? money(dto.unitCost) : undefined,
          },
        });

        if (opening > 0) {
          const balance = await this.applyStockDelta(tx, item.id, dto.openingWarehouseId!, opening);
          await tx.stockTransaction.create({
            data: {
              itemId: item.id,
              warehouseId: dto.openingWarehouseId!,
              type: 'OPENING',
              quantity: opening,
              balanceAfter: balance,
              refType: 'OPENING',
              notes: 'Opening balance',
              performedById,
            },
          });
        }
        return item;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`SKU "${dto.sku}" already exists in this organization`);
      }
      throw err;
    }
  }

  async updateItem(id: string, dto: UpdateInventoryItemDto) {
    await this.findItem(id);
    try {
      return await this.prisma.inventoryItem.update({
        where: { id },
        data: {
          sku: dto.sku,
          name: dto.name,
          unitOfMeasure: dto.unitOfMeasure,
          description: dto.description,
          reorderPoint: dto.reorderPoint,
          reorderQuantity: dto.reorderQuantity,
          categoryId: dto.categoryId,
          location: dto.location,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`SKU "${dto.sku}" already exists in this organization`);
      }
      throw err;
    }
  }

  // Soft delete only, and only once nothing is left on the shelf — purchases,
  // issues and ledger rows keep pointing at the item afterwards.
  async deleteItem(id: string) {
    const item = await this.findItem(id);
    const onHand = item.stockLevels.reduce((sum, level) => sum + level.quantityOnHand, 0);
    if (round3(onHand) !== 0) {
      throw new BadRequestException(
        `Only items with zero stock can be deleted (${item.sku} has ${round3(onHand)} on hand). Adjust stock to zero first.`,
      );
    }
    return this.prisma.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // One row per live item with its total on hand across warehouses, stock
  // value at the current weighted-average cost, and a reorder status — what
  // the Store page and the low-stock alerts are built from.
  async getStockOverview(filters: { organizationId?: string }) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: filters.organizationId, deletedAt: null },
      include: { stockLevels: { include: { warehouse: true } }, category: true },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => {
      const totalOnHand = round3(item.stockLevels.reduce((sum, level) => sum + level.quantityOnHand, 0));
      const status: StockStatus =
        totalOnHand <= 0
          ? 'OUT_OF_STOCK'
          : item.reorderPoint != null && totalOnHand <= item.reorderPoint
            ? 'LOW_STOCK'
            : 'IN_STOCK';
      return {
        ...item,
        totalOnHand,
        stockValue: money(item.unitCost).times(totalOnHand).toDecimalPlaces(2),
        status,
      };
    });
  }

  // --- Stock transactions ---------------------------------------------------

  findTransactions(filters: {
    itemId?: string;
    warehouseId?: string;
    workOrderId?: string;
    type?: StockTransactionType;
    from?: string;
    to?: string;
  }) {
    return this.prisma.stockTransaction.findMany({
      where: {
        itemId: filters.itemId,
        warehouseId: filters.warehouseId,
        workOrderId: filters.workOrderId,
        type: filters.type,
        createdAt:
          filters.from || filters.to
            ? {
                gte: filters.from ? new Date(filters.from) : undefined,
                lte: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
              }
            : undefined,
      },
      include: { item: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordTransaction(dto: CreateStockTransactionDto, performedById: string) {
    if (dto.type !== 'ADJUSTMENT' && dto.quantity <= 0) {
      throw new BadRequestException(`quantity must be positive for ${dto.type}`);
    }
    if (dto.type === 'ADJUSTMENT' && dto.quantity === 0) {
      throw new BadRequestException('quantity must be non-zero for ADJUSTMENT');
    }

    const signedQuantity = round3(dto.type === 'ISSUE' ? -dto.quantity : dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const balance = await this.applyStockDelta(tx, dto.itemId, dto.warehouseId, signedQuantity);

      return tx.stockTransaction.create({
        data: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          type: dto.type,
          quantity: signedQuantity,
          balanceAfter: balance,
          notes: dto.notes,
          workOrderId: dto.workOrderId,
          performedById,
        },
      });
    });
  }

  // A stock-take: the caller says what was physically counted, the service
  // posts the difference. A reason is mandatory so every correction is explained.
  async adjustStock(dto: AdjustStockDto, performedById: string) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reason is required for stock adjustments');
    }
    if (dto.countedQuantity < 0) {
      throw new BadRequestException('countedQuantity cannot be negative');
    }

    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({
        where: { itemId_warehouseId: { itemId: dto.itemId, warehouseId: dto.warehouseId } },
      });
      const delta = round3(dto.countedQuantity - (level?.quantityOnHand ?? 0));
      if (delta === 0) {
        throw new BadRequestException('Counted quantity equals the current stock — nothing to adjust');
      }

      const balance = await this.applyStockDelta(tx, dto.itemId, dto.warehouseId, delta);
      return tx.stockTransaction.create({
        data: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          type: 'ADJUSTMENT',
          quantity: delta,
          balanceAfter: balance,
          refType: 'ADJUSTMENT',
          notes: reason,
          performedById,
        },
      });
    });
  }

  async transfer(dto: TransferStockDto, performedById: string) {
    if (dto.quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('fromWarehouseId and toWarehouseId must differ');
    }
    const quantity = round3(dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const fromBalance = await this.applyStockDelta(tx, dto.itemId, dto.fromWarehouseId, -quantity);
      const toBalance = await this.applyStockDelta(tx, dto.itemId, dto.toWarehouseId, quantity);

      const [outTxn, inTxn] = await Promise.all([
        tx.stockTransaction.create({
          data: {
            itemId: dto.itemId,
            warehouseId: dto.fromWarehouseId,
            type: 'TRANSFER',
            quantity: -quantity,
            balanceAfter: fromBalance,
            notes: dto.notes,
            performedById,
          },
        }),
        tx.stockTransaction.create({
          data: {
            itemId: dto.itemId,
            warehouseId: dto.toWarehouseId,
            type: 'TRANSFER',
            quantity,
            balanceAfter: toBalance,
            notes: dto.notes,
            performedById,
          },
        }),
      ]);

      return { out: outTxn, in: inTxn };
    });
  }

  // --- Purchases (goods received) -------------------------------------------

  findPurchases(filters: { organizationId?: string; vendorId?: string; itemId?: string; from?: string; to?: string }) {
    return this.prisma.purchase.findMany({
      where: {
        organizationId: filters.organizationId,
        vendorId: filters.vendorId,
        itemId: filters.itemId,
        deletedAt: null,
        date: this.dateRange(filters.from, filters.to),
      },
      include: { item: true, vendor: true, warehouse: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // Raises stock in the given warehouse and recalculates the item's
  // weighted-average cost across everything on hand in every warehouse:
  // (oldStock * oldCost + qty * cost) / (oldStock + qty).
  async recordPurchase(dto: CreatePurchaseDto, receivedById: string) {
    const quantity = round3(dto.quantity);
    if (!(quantity > 0)) {
      throw new BadRequestException('quantity must be positive');
    }
    if (!(dto.unitCost >= 0)) {
      throw new BadRequestException('unitCost cannot be negative');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.itemId } });
      if (!item || item.deletedAt) throw new NotFoundException(`Inventory item ${dto.itemId} not found`);
      const vendor = await tx.vendor.findUnique({ where: { id: dto.vendorId } });
      if (!vendor) throw new NotFoundException(`Vendor ${dto.vendorId} not found`);
      if (vendor.organizationId !== item.organizationId) {
        throw new BadRequestException('Vendor and item belong to different organizations');
      }

      const levels = await tx.stockLevel.findMany({ where: { itemId: item.id } });
      const oldStock = levels.reduce((sum, level) => sum + level.quantityOnHand, 0);
      const cost = money(dto.unitCost);
      // quantity > 0, so the divisor is never zero; with nothing on hand this
      // naturally comes out as the purchase cost.
      const newCost = money(item.unitCost)
        .times(oldStock)
        .plus(cost.times(quantity))
        .dividedBy(oldStock + quantity)
        .toDecimalPlaces(2);

      const balance = await this.applyStockDelta(tx, item.id, dto.warehouseId, quantity);

      const purchase = await tx.purchase.create({
        data: {
          organizationId: item.organizationId,
          warehouseId: dto.warehouseId,
          itemId: item.id,
          vendorId: vendor.id,
          poNumber: dto.poNumber,
          date: dto.date ? new Date(dto.date) : new Date(),
          quantity,
          unitCost: cost,
          total: cost.times(quantity).toDecimalPlaces(2),
          notes: dto.notes,
          receivedById,
        },
      });
      await tx.inventoryItem.update({ where: { id: item.id }, data: { unitCost: newCost } });
      await tx.stockTransaction.create({
        data: {
          itemId: item.id,
          warehouseId: dto.warehouseId,
          type: 'RECEIPT',
          quantity,
          balanceAfter: balance,
          refType: 'PURCHASE',
          refId: purchase.id,
          notes: `PO ${dto.poNumber ?? '-'}`,
          performedById: receivedById,
        },
      });
      return purchase;
    });
  }

  // Soft-deletes the purchase and posts a reversing ledger row. Refuses if
  // some of that stock has already been issued — the shelf can't go negative.
  async deletePurchase(id: string, performedById: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { id } });
    if (!purchase || purchase.deletedAt) {
      throw new NotFoundException(`Purchase ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const balance = await this.applyStockDelta(tx, purchase.itemId, purchase.warehouseId, -purchase.quantity);
      await tx.stockTransaction.create({
        data: {
          itemId: purchase.itemId,
          warehouseId: purchase.warehouseId,
          type: 'REVERSAL',
          quantity: -purchase.quantity,
          balanceAfter: balance,
          refType: 'PURCHASE_DELETED',
          refId: purchase.id,
          notes: `Purchase ${purchase.id} deleted`,
          performedById,
        },
      });
      return tx.purchase.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  // --- Consumption (items issued) --------------------------------------------

  findConsumptions(filters: {
    organizationId?: string;
    departmentId?: string;
    projectId?: string;
    itemId?: string;
    from?: string;
    to?: string;
  }) {
    return this.prisma.consumption.findMany({
      where: {
        organizationId: filters.organizationId,
        departmentId: filters.departmentId,
        projectId: filters.projectId,
        itemId: filters.itemId,
        deletedAt: null,
        date: this.dateRange(filters.from, filters.to),
      },
      include: { item: true, project: true, department: true, warehouse: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // Issues stock out of a warehouse, charged to a department and/or project
  // at the item's current weighted-average cost. Stock never goes negative.
  async recordConsumption(dto: CreateConsumptionDto, issuedById: string) {
    const quantity = round3(dto.quantity);
    if (!(quantity > 0)) {
      throw new BadRequestException('quantity must be positive');
    }
    if (!dto.departmentId && !dto.projectId) {
      throw new BadRequestException('Select a department or a project / job to charge the items to');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.itemId } });
      if (!item || item.deletedAt) throw new NotFoundException(`Inventory item ${dto.itemId} not found`);
      if (dto.departmentId && !(await tx.department.findUnique({ where: { id: dto.departmentId } }))) {
        throw new NotFoundException(`Department ${dto.departmentId} not found`);
      }
      if (dto.projectId && !(await tx.project.findUnique({ where: { id: dto.projectId } }))) {
        throw new NotFoundException(`Project ${dto.projectId} not found`);
      }

      const balance = await this.applyStockDelta(tx, item.id, dto.warehouseId, -quantity);
      const cost = money(item.unitCost);

      const consumption = await tx.consumption.create({
        data: {
          organizationId: item.organizationId,
          warehouseId: dto.warehouseId,
          itemId: item.id,
          date: dto.date ? new Date(dto.date) : new Date(),
          quantity,
          unitCost: cost,
          total: cost.times(quantity).toDecimalPlaces(2),
          departmentId: dto.departmentId,
          projectId: dto.projectId,
          issuedTo: dto.issuedTo,
          purpose: dto.purpose,
          issuedById,
        },
      });
      await tx.stockTransaction.create({
        data: {
          itemId: item.id,
          warehouseId: dto.warehouseId,
          type: 'ISSUE',
          quantity: -quantity,
          balanceAfter: balance,
          refType: 'CONSUMPTION',
          refId: consumption.id,
          notes: dto.purpose || 'Issued',
          performedById: issuedById,
        },
      });
      return consumption;
    });
  }

  async deleteConsumption(id: string, performedById: string) {
    const consumption = await this.prisma.consumption.findUnique({ where: { id } });
    if (!consumption || consumption.deletedAt) {
      throw new NotFoundException(`Consumption ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const balance = await this.applyStockDelta(tx, consumption.itemId, consumption.warehouseId, consumption.quantity);
      await tx.stockTransaction.create({
        data: {
          itemId: consumption.itemId,
          warehouseId: consumption.warehouseId,
          type: 'REVERSAL',
          quantity: consumption.quantity,
          balanceAfter: balance,
          refType: 'ISSUE_DELETED',
          refId: consumption.id,
          notes: `Issue ${consumption.id} deleted`,
          performedById,
        },
      });
      return tx.consumption.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    };
  }

  // Applies a signed quantity delta to (itemId, warehouseId)'s running
  // balance, rejecting anything that would take it negative, and returns the
  // new balance. Every write to StockLevel.quantityOnHand must go through
  // here so the ledger (StockTransaction) and the running balance never
  // drift apart.
  private async applyStockDelta(
    tx: Prisma.TransactionClient,
    itemId: string,
    warehouseId: string,
    delta: number,
  ): Promise<number> {
    const [item, warehouse] = await Promise.all([
      tx.inventoryItem.findUnique({ where: { id: itemId } }),
      tx.warehouse.findUnique({ where: { id: warehouseId } }),
    ]);
    if (!item) throw new NotFoundException(`Inventory item ${itemId} not found`);
    if (!warehouse) throw new NotFoundException(`Warehouse ${warehouseId} not found`);
    if (warehouse.organizationId !== item.organizationId) {
      throw new BadRequestException('Warehouse and item belong to different organizations');
    }

    const existing = await tx.stockLevel.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
    });
    const currentBalance = existing?.quantityOnHand ?? 0;
    const newBalance = round3(currentBalance + delta);

    if (newBalance < 0) {
      throw new BadRequestException(
        `Insufficient stock: ${item.sku} at ${warehouse.code} has ${currentBalance} on hand, cannot apply ${delta}`,
      );
    }

    await tx.stockLevel.upsert({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      create: { itemId, warehouseId, quantityOnHand: newBalance },
      update: { quantityOnHand: newBalance },
    });
    return newBalance;
  }
}
