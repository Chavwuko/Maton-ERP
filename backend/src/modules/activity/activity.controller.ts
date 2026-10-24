import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../auth/roles.guard';
import { ActivityService } from './activity.service';

// Who did what, newest first. Admin only: it names every user's actions.
@Controller('activity')
@Roles('admin')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  list(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityService.list({ userId, action, entityType, from, to, limit });
  }
}
