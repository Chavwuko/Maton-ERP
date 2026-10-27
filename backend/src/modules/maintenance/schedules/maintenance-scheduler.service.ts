import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';

// Opens the preventive work orders that have come due. Hourly is plenty (due
// dates are whole days) and costs one cheap query; running it twice, or on
// several servers at once, is harmless because only one work order can be open
// per schedule.
@Injectable()
export class MaintenanceSchedulerService {
  private readonly logger = new Logger(MaintenanceSchedulerService.name);

  constructor(private readonly schedules: MaintenanceSchedulesService) {}

  @Cron('15 * * * *')
  async hourly(): Promise<number> {
    try {
      const { created } = await this.schedules.generateDue();
      if (created > 0) this.logger.log(`Opened ${created} preventive work order(s)`);
      return created;
    } catch (error) {
      this.logger.warn(`Preventive maintenance run failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
