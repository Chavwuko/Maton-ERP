import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ReviewAppointmentDto } from './dto/review-appointment.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

// Anyone signed in can book and cancel their own appointment; admin/inventory
// (the people who run the store) see everyone's and review them. Editing the
// schedule is admin only.
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('schedule')
  getSchedule() {
    return this.appointmentsService.getSchedule();
  }

  @Roles('admin')
  @Put('schedule')
  updateSchedule(@Body() dto: UpdateScheduleDto) {
    return this.appointmentsService.updateSchedule(dto);
  }

  @Get('slots')
  slots(@Query('date') date: string) {
    return this.appointmentsService.slots(date);
  }

  @Get('mine')
  findMine(@Req() req: Request) {
    return this.appointmentsService.findMine(req.user!.id);
  }

  @Roles('admin', 'inventory')
  @Get()
  findAll(@Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.appointmentsService.findAll({ status, from, to });
  }

  @Post()
  book(@Body() dto: CreateAppointmentDto, @Req() req: Request) {
    return this.appointmentsService.book(dto, req.user!);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: Request) {
    return this.appointmentsService.cancel(id, req.user!);
  }

  @Roles('admin', 'inventory')
  @Post(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewAppointmentDto, @Req() req: Request) {
    return this.appointmentsService.review(id, dto, req.user!);
  }
}
