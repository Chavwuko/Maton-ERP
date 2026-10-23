import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { StockTransactionType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateConsumptionDto } from './dto/create-consumption.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryService } from './inventory.service';
import { StaffCostRedactionInterceptor } from './staff-cost-redaction.interceptor';

// Any authenticated user can read; every mutation (registering a warehouse
// or item, recording a movement, purchase or issue) is restricted to
// admin/inventory since it changes a quantity other people rely on being
// accurate. Deleting a purchase or issue (which posts a reversing ledger
// row) is admin-only. Cost figures are hidden from the `staff` role.
@Controller()
@UseInterceptors(StaffCostRedactionInterceptor)
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

  @Get('item-categories')
  findAllCategories(@Query('organizationId') organizationId?: string) {
    return this.inventoryService.findAllCategories({ organizationId });
  }

  @Roles('admin', 'inventory')
  @Post('item-categories')
  createCategory(@Body() dto: CreateItemCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Get('inventory-items')
  findAllItems(
    @Query('organizationId') organizationId?: string,
    @Query('belowReorderPoint') belowReorderPoint?: string,
  ) {
    return this.inventoryService.findAllItems({ organizationId, belowReorderPoint: belowReorderPoint === 'true' });
  }

  // Declared before :id so Express matches it as a literal segment.
  @Get('inventory-items/overview')
  getStockOverview(@Query('organizationId') organizationId?: string) {
    return this.inventoryService.getStockOverview({ organizationId });
  }

  @Get('inventory-items/:id')
  findItem(@Param('id') id: string) {
    return this.inventoryService.findItem(id);
  }

  @Roles('admin', 'inventory')
  @Post('inventory-items')
  createItem(@Body() dto: CreateInventoryItemDto, @Req() req: Request) {
    return this.inventoryService.createItem(dto, req.user!.id);
  }

  @Roles('admin', 'inventory')
  @Patch('inventory-items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventoryService.updateItem(id, dto);
  }

  @Roles('admin')
  @Delete('inventory-items/:id')
  deleteItem(@Param('id') id: string) {
    return this.inventoryService.deleteItem(id);
  }

  @Get('stock-transactions')
  findTransactions(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('type') type?: StockTransactionType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventoryService.findTransactions({ itemId, warehouseId, workOrderId, type, from, to });
  }

  @Roles('admin', 'inventory')
  @Post('stock-transactions')
  recordTransaction(@Body() dto: CreateStockTransactionDto, @Req() req: Request) {
    return this.inventoryService.recordTransaction(dto, req.user!.id);
  }

  @Roles('admin', 'inventory')
  @Post('stock-transactions/adjust')
  adjustStock(@Body() dto: AdjustStockDto, @Req() req: Request) {
    return this.inventoryService.adjustStock(dto, req.user!.id);
  }

  @Roles('admin', 'inventory')
  @Post('stock-transactions/transfer')
  transfer(@Body() dto: TransferStockDto, @Req() req: Request) {
    return this.inventoryService.transfer(dto, req.user!.id);
  }

  @Get('purchases')
  findPurchases(
    @Query('organizationId') organizationId?: string,
    @Query('vendorId') vendorId?: string,
    @Query('itemId') itemId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventoryService.findPurchases({ organizationId, vendorId, itemId, from, to });
  }

  @Roles('admin', 'inventory')
  @Post('purchases')
  recordPurchase(@Body() dto: CreatePurchaseDto, @Req() req: Request) {
    return this.inventoryService.recordPurchase(dto, req.user!.id);
  }

  @Roles('admin')
  @Delete('purchases/:id')
  deletePurchase(@Param('id') id: string, @Req() req: Request) {
    return this.inventoryService.deletePurchase(id, req.user!.id);
  }

  @Get('consumptions')
  findConsumptions(
    @Query('organizationId') organizationId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('projectId') projectId?: string,
    @Query('itemId') itemId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventoryService.findConsumptions({ organizationId, departmentId, projectId, itemId, from, to });
  }

  @Roles('admin', 'inventory')
  @Post('consumptions')
  recordConsumption(@Body() dto: CreateConsumptionDto, @Req() req: Request) {
    return this.inventoryService.recordConsumption(dto, req.user!.id);
  }

  @Roles('admin')
  @Delete('consumptions/:id')
  deleteConsumption(@Param('id') id: string, @Req() req: Request) {
    return this.inventoryService.deleteConsumption(id, req.user!.id);
  }
}
