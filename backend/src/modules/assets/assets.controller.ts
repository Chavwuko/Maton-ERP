import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../auth/roles.guard';
import { ASSIGNABLE_ROLES } from '../users/user-roles';
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

  @Get('dashboard')
  dashboard(@Query('organizationId') organizationId?: string) {
    return this.assetsService.dashboard({ organizationId });
  }

  // The register as a spreadsheet; staff get it without the money columns.
  @Get('export')
  async exportRegister(
    @Query('organizationId') organizationId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('projectId') projectId: string | undefined,
    @Query('departmentId') departmentId: string | undefined,
    @Query('condition') condition: string | undefined,
    @Query('search') search: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, content } = await this.assetsService.exportRegister(
      { organizationId, status, projectId, departmentId, condition, search },
      req.user!.roleName !== 'staff',
    );
    return this.asCsv(res, filename, content);
  }

  @Roles(...ASSIGNABLE_ROLES.filter((role) => role !== 'staff'))
  @Get('valuation/export')
  async exportValuation(
    @Query('organizationId') organizationId: string | undefined,
    @Query('asOf') asOf: string | undefined,
    @Query('includeDecommissioned') includeDecommissioned: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, content } = await this.assetsService.exportValuation({ organizationId, asOf, includeDecommissioned });
    return this.asCsv(res, filename, content);
  }

  // Book values are money, which the `staff` role never sees. Declared before
  // ':id' so "valuation" is not read as an id.
  @Roles(...ASSIGNABLE_ROLES.filter((role) => role !== 'staff'))
  @Get('valuation')
  valuationReport(
    @Query('organizationId') organizationId?: string,
    @Query('asOf') asOf?: string,
    @Query('includeDecommissioned') includeDecommissioned?: string,
  ) {
    return this.assetsService.valuationReport({ organizationId, asOf, includeDecommissioned });
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

  @Roles(...ASSIGNABLE_ROLES.filter((role) => role !== 'staff'))
  @Get(':id/valuation')
  valuation(@Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.assetsService.valuation(id, asOf);
  }

  @Get(':id/service-history')
  serviceHistory(@Param('id') id: string) {
    return this.assetsService.serviceHistory(id);
  }

  private asCsv(res: Response, filename: string, content: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return content;
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
