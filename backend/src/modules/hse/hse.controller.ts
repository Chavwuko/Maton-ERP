import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IncidentSeverity, IncidentStatus, IncidentType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { CreateCorrectiveActionDto } from './dto/create-corrective-action.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateCorrectiveActionDto } from './dto/update-corrective-action.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { HseService } from './hse.service';

// Anyone can read and report an incident — safety reporting should never be
// gated behind a role, same reasoning as Maintenance's open work-order
// creation. Progressing the investigation and managing corrective actions
// is restricted to admin/hse.
@Controller('incidents')
export class HseController {
  constructor(private readonly hseService: HseService) {}

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: IncidentStatus,
    @Query('type') type?: IncidentType,
    @Query('severity') severity?: IncidentSeverity,
    @Query('projectId') projectId?: string,
    @Query('assetId') assetId?: string,
  ) {
    return this.hseService.findAll({ organizationId, status, type, severity, projectId, assetId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hseService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateIncidentDto, @Req() req: Request) {
    return this.hseService.create(dto, req.user!.id);
  }

  @Roles('admin', 'hse')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateIncidentStatusDto) {
    return this.hseService.updateStatus(id, dto);
  }

  @Get(':id/corrective-actions')
  listCorrectiveActions(@Param('id') id: string) {
    return this.hseService.listCorrectiveActions(id);
  }

  @Roles('admin', 'hse')
  @Post(':id/corrective-actions')
  createCorrectiveAction(@Param('id') id: string, @Body() dto: CreateCorrectiveActionDto) {
    return this.hseService.createCorrectiveAction(id, dto);
  }

  @Roles('admin', 'hse')
  @Patch(':id/corrective-actions/:actionId')
  updateCorrectiveAction(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateCorrectiveActionDto,
  ) {
    return this.hseService.updateCorrectiveAction(id, actionId, dto);
  }
}
