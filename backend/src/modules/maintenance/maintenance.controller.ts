import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { MaintenanceService } from './maintenance.service';

// Any authenticated user can read and raise a work order (a fault can be
// reported by anyone); only maintenance/admin can assign or progress one —
// same asymmetry as Document Control (open create, gated decisions).
@Controller('work-orders')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('assetId') assetId?: string,
    @Query('status') status?: WorkOrderStatus,
    @Query('type') type?: WorkOrderType,
    @Query('priority') priority?: WorkOrderPriority,
  ) {
    return this.maintenanceService.findAll({ organizationId, assetId, status, type, priority });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWorkOrderDto, @Req() req: Request) {
    return this.maintenanceService.create(dto, req.user!.id);
  }

  @Roles('admin', 'maintenance')
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignWorkOrderDto) {
    return this.maintenanceService.assign(id, dto);
  }

  @Roles('admin', 'maintenance')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWorkOrderStatusDto) {
    return this.maintenanceService.updateStatus(id, dto);
  }
}
