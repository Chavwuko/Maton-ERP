import { Module } from '@nestjs/common';
import { DocumentControlModule } from '../document-control/document-control.module';
import { AppraisalsController } from './appraisals.controller';
import { AppraisalsService } from './appraisals.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [DocumentControlModule],
  controllers: [EmployeesController, AppraisalsController],
  providers: [EmployeesService, AppraisalsService],
  exports: [EmployeesService, AppraisalsService],
})
export class HrModule {}
