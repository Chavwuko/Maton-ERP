import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { getSchedule, nowIn } from '../appointments/appointment-schedule';
import { claimReminderDay } from '../settings/email-settings';
import { EmailNotifier } from './email-notifier';
import { MailService } from './mail.service';
import { personName, waitingReminder } from './templates';

// The hour of the day (in the schedule's time zone) the reminder goes out.
const REMINDER_HOUR = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

// Once a day, tells the admins about anything that has been waiting for them
// for more than 24 hours: sign-up requests and bookings awaiting review.
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifier: EmailNotifier,
  ) {}

  // Runs every hour; only the run that falls in the reminder hour does
  // anything, and only one server per day gets to send.
  @Cron('0 * * * *')
  async hourly(): Promise<number> {
    try {
      const { date, minutes } = nowIn((await getSchedule(this.prisma)).timeZone);
      if (Math.floor(minutes / 60) !== REMINDER_HOUR) return 0;
      if (!(await claimReminderDay(this.prisma, date))) return 0;
      return await this.sendReminder();
    } catch (error) {
      this.logger.warn(`Reminder run failed: ${(error as Error).message}`);
      return 0;
    }
  }

  // Returns how many waiting items the email listed (0 when there is nothing).
  async sendReminder(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DAY_MS);
    const [users, appointments] = await Promise.all([
      this.prisma.user.findMany({ where: { status: 'PENDING', createdAt: { lt: cutoff } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.appointment.findMany({
        where: { status: 'PENDING', createdAt: { lt: cutoff } },
        include: { requester: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      }),
    ]);
    if (users.length + appointments.length === 0) return 0;

    const email = waitingReminder(
      users.map((user) => ({ name: personName(user), email: user.email })),
      appointments.map((a) => ({ subject: a.subject, requester: personName(a.requester), date: a.date, time: a.time })),
    );
    await this.mail.send(await this.notifier.emailsOf(['admin']), email.subject, email.body + this.mail.link('/users?tab=requests', 'Open the system'));
    return users.length + appointments.length;
  }
}
