import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailNotifier } from './email-notifier';
import { MailService } from './mail.service';
import { RemindersService } from './reminders.service';

// Global so users and appointments can tell people about what happened
// without each importing it.
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MailService, EmailNotifier, RemindersService],
  exports: [MailService, EmailNotifier],
})
export class MailModule {}
