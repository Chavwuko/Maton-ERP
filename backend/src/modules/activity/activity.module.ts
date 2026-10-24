import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityLogInterceptor } from './activity-log.interceptor';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  controllers: [ActivityController],
  providers: [ActivityService, { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor }],
})
export class ActivityModule {}
