import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [InventoryModule],
  controllers: [ReportsController],
  providers: [DashboardService, ReportsService],
})
export class ReportsModule {}
