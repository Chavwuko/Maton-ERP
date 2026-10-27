import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { StaffCostRedactionInterceptor } from '../inventory/staff-cost-redaction.interceptor';
import { AssetsService } from './assets.service';
import { CheckInAssetDto } from './dto/check-in-asset.dto';
import { CheckOutAssetDto } from './dto/check-out-asset.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

// Same read/write split as Organizations: any authenticated user can read,
// registering, editing and handing out equipment is restricted to the roles
// that manage it. The purchase cost is hidden from the `staff` role.
@Controller('assets')
@UseInterceptors(StaffCostRedactionInterceptor)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('condition') condition?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('search') search?: string,
  ) {
    return this.assetsService.findAll({ organizationId, status, projectId, departmentId, condition, assignedToId, search });
  }

  // Declared before ':id' so "mine" is not read as an id.
  @Get('mine')
  findMine(@Req() req: Request) {
    return this.assetsService.findMine(req.user!.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assetsService.findOne(id);
  }

  @Get(':id/assignments')
  assignments(@Param('id') id: string) {
    return this.assetsService.assignments(id);
  }

  @Get(':id/service-history')
  serviceHistory(@Param('id') id: string) {
    return this.assetsService.serviceHistory(id);
  }

  @Roles('admin', 'maintenance')
  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.assetsService.history(id);
  }

  @Roles('admin', 'maintenance')
  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.assetsService.create(dto);
  }

  @Roles('admin', 'maintenance')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetsService.update(id, dto);
  }

  @Roles('admin', 'maintenance')
  @Post(':id/check-out')
  checkOut(@Param('id') id: string, @Body() dto: CheckOutAssetDto, @Req() req: Request) {
    return this.assetsService.checkOut(id, dto, req.user!);
  }

  @Roles('admin', 'maintenance')
  @Post(':id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: CheckInAssetDto, @Req() req: Request) {
    return this.assetsService.checkIn(id, dto, req.user!);
  }
}
