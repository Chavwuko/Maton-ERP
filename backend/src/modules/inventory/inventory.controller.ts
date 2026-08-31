import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { InventoryService } from './inventory.service';

// Any authenticated user can read; every mutation (registering a warehouse
// or item, recording a movement) is restricted to admin/inventory since it
// changes a quantity other people rely on being accurate.
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('warehouses')
  findAllWarehouses(@Query('organizationId') organizationId?: string) {
    return this.inventoryService.findAllWarehouses({ organizationId });
  }

  @Get('warehouses/:id')
  findWarehouse(@Param('id') id: string) {
    return this.inventoryService.findWarehouse(id);
  }

  @Roles('admin', 'inventory')
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get('inventory-items')
  findAllItems(
    @Query('organizationId') organizationId?: string,
    @Query('belowReorderPoint') belowReorderPoint?: string,
  ) {
    return this.inventoryService.findAllItems({ organizationId, belowReorderPoint: belowReorderPoint === 'true' });
  }

  @Get('inventory-items/:id')
  findItem(@Param('id') id: string) {
    return this.inventoryService.findItem(id);
  }

  @Roles('admin', 'inventory')
  @Post('inventory-items')
  createItem(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @Get('stock-transactions')
  findTransactions(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('workOrderId') workOrderId?: string,
  ) {
    return this.inventoryService.findTransactions({ itemId, warehouseId, workOrderId });
  }

  @Roles('admin', 'inventory')
  @Post('stock-transactions')
  recordTransaction(@Body() dto: CreateStockTransactionDto, @Req() req: Request) {
    return this.inventoryService.recordTransaction(dto, req.user!.id);
  }

  @Roles('admin', 'inventory')
  @Post('stock-transactions/transfer')
  transfer(@Body() dto: TransferStockDto, @Req() req: Request) {
    return this.inventoryService.transfer(dto, req.user!.id);
  }
}
