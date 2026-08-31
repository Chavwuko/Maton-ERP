import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AppraisalCycleStatus, AppraisalStatus } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { AppraisalsService } from './appraisals.service';
import { CreateAppraisalCycleDto } from './dto/create-appraisal-cycle.dto';
import { CreateAppraisalDto } from './dto/create-appraisal.dto';
import { SubmitAppraisalReviewDto } from './dto/submit-appraisal-review.dto';
import { UpdateAppraisalCycleStatusDto } from './dto/update-appraisal-cycle-status.dto';
import { EmployeesService } from './employees.service';

// Setting up cycles/appraisals is restricted to admin/hr; submitting a
// review is open to any authenticated user since authorization there is
// data-driven — you must be one of the assigned reviewers on your own
// employee record, checked in AppraisalsService, not via @Roles(...) (same
// pattern as Document Control's recordDecision).
@Controller()
export class AppraisalsController {
  constructor(
    private readonly appraisalsService: AppraisalsService,
    private readonly employeesService: EmployeesService,
  ) {}

  @Get('appraisal-cycles')
  findAllCycles(@Query('organizationId') organizationId?: string, @Query('status') status?: AppraisalCycleStatus) {
    return this.appraisalsService.findAllCycles({ organizationId, status });
  }

  @Get('appraisal-cycles/:id')
  findCycle(@Param('id') id: string) {
    return this.appraisalsService.findCycle(id);
  }

  @Roles('admin', 'hr')
  @Post('appraisal-cycles')
  createCycle(@Body() dto: CreateAppraisalCycleDto) {
    return this.appraisalsService.createCycle(dto);
  }

  @Roles('admin', 'hr')
  @Patch('appraisal-cycles/:id/status')
  updateCycleStatus(@Param('id') id: string, @Body() dto: UpdateAppraisalCycleStatusDto) {
    return this.appraisalsService.updateCycleStatus(id, dto);
  }

  @Roles('admin', 'hr')
  @Post('appraisal-cycles/:id/appraisals')
  createAppraisal(@Param('id') id: string, @Body() dto: CreateAppraisalDto) {
    return this.appraisalsService.createAppraisal(id, dto);
  }

  @Get('appraisals')
  findAllAppraisals(
    @Query('organizationId') organizationId?: string,
    @Query('cycleId') cycleId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: AppraisalStatus,
  ) {
    return this.appraisalsService.findAllAppraisals({ organizationId, cycleId, employeeId, status });
  }

  @Get('appraisals/:id')
  findAppraisal(@Param('id') id: string) {
    return this.appraisalsService.findAppraisal(id);
  }

  @Post('appraisals/:id/reviews')
  async submitReview(@Param('id') id: string, @Body() dto: SubmitAppraisalReviewDto, @Req() req: Request) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.appraisalsService.submitReview(id, employee.id, dto);
  }
}
