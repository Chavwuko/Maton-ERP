import { Module } from '@nestjs/common';
import { DocumentControlModule } from '../document-control/document-control.module';
import { AppraisalsController } from './appraisals.controller';
import { AppraisalsService } from './appraisals.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [DocumentControlModule],
  controllers: [EmployeesController, AppraisalsController, ShiftsController, AttendanceController],
  providers: [EmployeesService, AppraisalsService, ShiftsService, AttendanceService],
  exports: [EmployeesService, AppraisalsService, ShiftsService, AttendanceService],
})
export class HrModule {}
