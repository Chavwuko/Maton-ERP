import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { NotificationsService } from './notifications.service';

// For the people who run the store: admin also sees sign-up requests.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Roles('admin', 'inventory')
  @Get()
  forUser(@Req() req: Request) {
    return this.notificationsService.forUser(req.user!);
  }
}
