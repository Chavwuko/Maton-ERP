import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from './mail.service';
import * as templates from './templates';
import type { BookingMail, Person } from './templates';

type Booking = BookingMail & { id: string };

// The events people are told about by email. Every method is safe to call
// without awaiting a result: it never throws, because the action that
// triggered it (approving someone, booking a slot) has already succeeded.
@Injectable()
export class EmailNotifier {
  private readonly logger = new Logger(EmailNotifier.name);

  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  // Admins hear about each new sign-up request.
  accessRequested(requester: Person, departmentName: string | null) {
    return this.safely('accessRequested', async () => {
      const email = templates.accessRequested(requester, departmentName);
      await this.mail.send(await this.emailsOf(['admin']), email.subject, email.body + this.mail.link('/users?tab=requests', 'Review requests'));
    });
  }

  accessApproved(user: Person, roleName: string) {
    return this.safely('accessApproved', async () => {
      const email = templates.accessApproved(user, roleName);
      await this.mail.send([user.email], email.subject, email.body + this.mail.link('/', 'Open the system'));
    });
  }

  accessRejected(user: Person, reason: string | null) {
    return this.safely('accessRejected', async () => {
      const email = templates.accessRejected(user, reason);
      await this.mail.send([user.email], email.subject, email.body);
    });
  }

  // The store hears about every booking and about the requester cancelling.
  bookingCreated(booking: Booking) {
    return this.safely('bookingCreated', async () => {
      const email = templates.bookingCreated(booking);
      await this.mail.send(await this.emailsOf(['admin', 'inventory']), email.subject, email.body + this.mail.link('/appointments?tab=all', 'Open to review'));
    });
  }

  bookingCancelledByRequester(booking: Booking) {
    return this.safely('bookingCancelledByRequester', async () => {
      const email = templates.bookingCancelledByRequester(booking);
      await this.mail.send(await this.emailsOf(['admin', 'inventory']), email.subject, email.body);
    });
  }

  // The requester hears about every decision, and about the store cancelling.
  bookingDecided(booking: Booking) {
    return this.safely('bookingDecided', async () => {
      const email = templates.bookingDecided(booking);
      await this.mail.send([booking.requester.email], email.subject, email.body + this.mail.link('/appointments?tab=mine', 'Open your bookings'));
    });
  }

  // Whoever it is assigned to hears about a preventive work order the moment a
  // schedule opens it; with no one assigned, the maintenance team does.
  scheduledWorkOrder(workOrder: {
    title: string;
    assetTag: string;
    assetName: string;
    dueDate: Date;
    assignee: { email: string } | null;
  }) {
    return this.safely('scheduledWorkOrder', async () => {
      const email = templates.scheduledWorkOrder(workOrder);
      const to = workOrder.assignee ? [workOrder.assignee.email] : await this.emailsOf(['maintenance']);
      await this.mail.send(to, email.subject, email.body + this.mail.link('/maintenance', 'Open work orders'));
    });
  }

  // Active admin/inventory users with an email address.
  async emailsOf(roles: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', role: { name: { in: roles } } },
      select: { email: true },
    });
    return users.map((user) => user.email);
  }

  private async safely(what: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.warn(`Notification ${what} failed: ${(error as Error).message}`);
    }
  }
}
