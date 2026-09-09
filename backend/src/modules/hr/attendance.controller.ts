import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { EmployeesService } from './employees.service';

// Self clock-in/out and one's own history are open to any authenticated
// employee; viewing or managing anyone else's attendance is admin/hr only —
// the same self-vs-admin split as EmployeesController.
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly employeesService: EmployeesService,
  ) {}

  @Post('clock-in')
  async clockIn(@Req() req: Request) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.attendanceService.clockIn(employee.id);
  }

  @Post('clock-out')
  async clockOut(@Req() req: Request) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.attendanceService.clockOut(employee.id);
  }

  @Get('me')
  async findMine(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.attendanceService.findForEmployee(employee.id, { from, to });
  }

  @Roles('admin', 'hr')
  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: AttendanceStatus,
  ) {
    return this.attendanceService.findAll({ employeeId, from, to, status });
  }

  @Roles('admin', 'hr')
  @Post()
  create(@Body() dto: CreateAttendanceRecordDto) {
    return this.attendanceService.create(dto);
  }

  @Roles('admin', 'hr')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAttendanceRecordDto) {
    return this.attendanceService.update(id, dto);
  }
}
