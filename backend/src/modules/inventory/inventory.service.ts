import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';

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

  // --- Inventory items -----------------------------------------------------

  async findAllItems(filters: { organizationId?: string; belowReorderPoint?: boolean }) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: filters.organizationId },
      include: { stockLevels: true },
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
      include: { stockLevels: { include: { warehouse: true } } },
    });
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }
    return item;
  }

  async createItem(dto: CreateInventoryItemDto) {
    try {
      return await this.prisma.inventoryItem.create({ data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`SKU "${dto.sku}" already exists in this organization`);
      }
      throw err;
    }
  }

  // --- Stock transactions ---------------------------------------------------

  findTransactions(filters: { itemId?: string; warehouseId?: string; workOrderId?: string }) {
    return this.prisma.stockTransaction.findMany({
      where: {
        itemId: filters.itemId,
        warehouseId: filters.warehouseId,
        workOrderId: filters.workOrderId,
      },
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

    const signedQuantity = dto.type === 'ISSUE' ? -dto.quantity : dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      await this.applyStockDelta(tx, dto.itemId, dto.warehouseId, signedQuantity);

      return tx.stockTransaction.create({
        data: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          type: dto.type,
          quantity: signedQuantity,
          notes: dto.notes,
          workOrderId: dto.workOrderId,
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

    return this.prisma.$transaction(async (tx) => {
      await this.applyStockDelta(tx, dto.itemId, dto.fromWarehouseId, -dto.quantity);
      await this.applyStockDelta(tx, dto.itemId, dto.toWarehouseId, dto.quantity);

      const [outTxn, inTxn] = await Promise.all([
        tx.stockTransaction.create({
          data: {
            itemId: dto.itemId,
            warehouseId: dto.fromWarehouseId,
            type: 'TRANSFER',
            quantity: -dto.quantity,
            notes: dto.notes,
            performedById,
          },
        }),
        tx.stockTransaction.create({
          data: {
            itemId: dto.itemId,
            warehouseId: dto.toWarehouseId,
            type: 'TRANSFER',
            quantity: dto.quantity,
            notes: dto.notes,
            performedById,
          },
        }),
      ]);

      return { out: outTxn, in: inTxn };
    });
  }

  // Applies a signed quantity delta to (itemId, warehouseId)'s running
  // balance, rejecting anything that would take it negative. Every write to
  // StockLevel.quantityOnHand must go through here so the ledger
  // (StockTransaction) and the running balance never drift apart.
  private async applyStockDelta(
    tx: Prisma.TransactionClient,
    itemId: string,
    warehouseId: string,
    delta: number,
  ): Promise<void> {
    const [item, warehouse] = await Promise.all([
      tx.inventoryItem.findUnique({ where: { id: itemId } }),
      tx.warehouse.findUnique({ where: { id: warehouseId } }),
    ]);
    if (!item) throw new NotFoundException(`Inventory item ${itemId} not found`);
    if (!warehouse) throw new NotFoundException(`Warehouse ${warehouseId} not found`);

    const existing = await tx.stockLevel.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId } },
    });
    const currentBalance = existing?.quantityOnHand ?? 0;
    const newBalance = currentBalance + delta;

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
  }
}
