import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { CreateLeaveRequestDto, CreateLeaveTypeDto, LeaveDecisionDto, LeaveDefaultsDto, UpdateLeaveTypeDto } from './dto/leave.dto';
import { LeaveTypesService } from './leave-types.service';
import { LeaveService } from './leave.service';

// Anyone with an employee record files and tracks their own leave. Deciding is
// by position, not role, so the service checks who may act on each request;
// the director and HR steps follow the `executive_director` and `hr` roles.
// Leave types are HR's to maintain.
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly types: LeaveTypesService,
  ) {}

  @Get('access')
  access(@Req() req: Request) {
    return this.leave.access(req.user!);
  }

  @Get('types')
  findTypes(@Query('organizationId') organizationId?: string, @Query('all') all?: string) {
    return this.types.findAll({ organizationId, includeInactive: all === 'true' });
  }

  @Roles('admin', 'hr')
  @Post('types')
  createType(@Body() dto: CreateLeaveTypeDto) {
    return this.types.create(dto);
  }

  // Declared before ':id' so "defaults" is not read as an id.
  @Roles('admin', 'hr')
  @Post('types/defaults')
  createDefaults(@Body() dto: LeaveDefaultsDto) {
    return this.types.createDefaults(dto.organizationId);
  }

  @Roles('admin', 'hr')
  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.types.update(id, dto);
  }

  @Get('balance')
  balance(@Req() req: Request, @Query('employeeId') employeeId?: string, @Query('year') year?: string) {
    return this.leave.balance(req.user!, { employeeId, year });
  }

  @Get('on-leave')
  onLeave(@Req() req: Request, @Query('date') date?: string, @Query('departmentId') departmentId?: string) {
    return this.leave.onLeave(req.user!, { date, departmentId });
  }

  @Post('requests')
  create(@Body() dto: CreateLeaveRequestDto, @Req() req: Request) {
    return this.leave.create(req.user!, dto);
  }

  // The next two are declared before ':id' so they are not read as ids.
  @Get('requests/mine')
  mine(@Req() req: Request, @Query('status') status?: string) {
    return this.leave.mine(req.user!, { status });
  }

  @Get('requests/inbox')
  inbox(@Req() req: Request) {
    return this.leave.inbox(req.user!);
  }

  @Get('requests')
  findAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.leave.findAll(req.user!, { status, employeeId, departmentId, from, to });
  }

  @Get('requests/:id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.leave.findOne(id, req.user!);
  }

  @Post('requests/:id/decision')
  decide(@Param('id') id: string, @Body() dto: LeaveDecisionDto, @Req() req: Request) {
    return this.leave.decide(id, req.user!, dto);
  }

  @Post('requests/:id/cancel')
  cancel(@Param('id') id: string, @Req() req: Request) {
    return this.leave.cancel(id, req.user!);
  }
}
