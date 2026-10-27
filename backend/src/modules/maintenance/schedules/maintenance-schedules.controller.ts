import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../auth/roles.guard';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dto/update-maintenance-schedule.dto';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';

// Anyone can see what is scheduled; planning it is for the people who do the
// maintenance. Removing a schedule is admin only.
@Controller('maintenance-schedules')
export class MaintenanceSchedulesController {
  constructor(private readonly schedulesService: MaintenanceSchedulesService) {}

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('assetId') assetId?: string,
    @Query('active') active?: string,
    @Query('dueStatus') dueStatus?: string,
  ) {
    return this.schedulesService.findAll({ organizationId, assetId, active, dueStatus });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }

  @Roles('admin', 'maintenance')
  @Post()
  create(@Body() dto: CreateMaintenanceScheduleDto, @Req() req: Request) {
    return this.schedulesService.create(dto, req.user!);
  }

  // Opens the work orders that are due right now instead of waiting for the
  // hourly run. Declared before ':id' so "generate" is not read as an id.
  @Roles('admin', 'maintenance')
  @Post('generate')
  generate() {
    return this.schedulesService.generateDue();
  }

  @Roles('admin', 'maintenance')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceScheduleDto) {
    return this.schedulesService.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }
}
