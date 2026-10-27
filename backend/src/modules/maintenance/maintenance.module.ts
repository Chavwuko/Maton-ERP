import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceSchedulesController } from './schedules/maintenance-schedules.controller';
import { MaintenanceSchedulerService } from './schedules/maintenance-scheduler.service';
import { MaintenanceSchedulesService } from './schedules/maintenance-schedules.service';

@Module({
  controllers: [MaintenanceController, MaintenanceSchedulesController],
  providers: [MaintenanceService, MaintenanceSchedulesService, MaintenanceSchedulerService],
  exports: [MaintenanceService, MaintenanceSchedulesService],
})
export class MaintenanceModule {}
