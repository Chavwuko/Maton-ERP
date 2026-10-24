import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../auth/roles.guard';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

// Reports show money, so they are limited to the roles that see costs.
const REPORT_ROLES = ['admin', 'inventory', 'finance', 'viewer'];

@Controller()
export class ReportsController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly reportsService: ReportsService,
  ) {}

  // Open to everyone: the service decides whether you get the store-wide
  // picture or one about your own appointments.
  @Get('dashboard/inventory')
  dashboard(@Req() req: Request) {
    return this.dashboardService.forUser(req.user!);
  }

  @Roles(...REPORT_ROLES)
  @Get('reports/inventory')
  inventoryReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.inventoryReport({ from, to });
  }

  @Roles(...REPORT_ROLES)
  @Get('reports/inventory/csv')
  async csv(
    @Query('type') type: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, content } = await this.reportsService.csv(type, { from, to });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return content;
  }
}
