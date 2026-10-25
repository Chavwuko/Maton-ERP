import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { isEmailEnabled } from '../settings/email-settings';
import { LogTransport, MailTransport, SmtpTransport } from './mail.transport';

// Addresses that can never be real inboxes: reserved test domains and the
// fake ones local development and the tests use. Skipping them means demo and
// test data can never send real mail.
const UNDELIVERABLE = /(@(example\.(com|org|net)|local\.dev)|\.(test|invalid|example|localhost))$/i;

export function isDeliverable(email: string | null | undefined): email is string {
  return !!email && email.includes('@') && !UNDELIVERABLE.test(email.trim());
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  readonly appName: string;
  readonly appUrl: string;
  // Replaceable so tests can capture what would be sent.
  transport: MailTransport;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.appName = config.get<string>('APP_NAME') ?? 'ERP Foundations';
    this.appUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
    this.transport = this.chooseTransport(config);
  }

  // The master switch lives in the database so an admin can flip it without a
  // deploy; the transport (log or SMTP) is fixed by configuration.
  isEnabled(): Promise<boolean> {
    return isEmailEnabled(this.prisma);
  }

  // Sends one message per recipient. A mail problem must never get in the way
  // of the work that triggered it, so failures are logged, not thrown.
  async send(recipients: (string | null | undefined)[], subject: string, body: string): Promise<number> {
    try {
      if (!(await this.isEnabled())) return 0;

      const to = [...new Set(recipients.filter(isDeliverable).map((address) => address.trim()))];
      const text = `${body}\n\n— ${this.appName}`;
      const results = await Promise.allSettled(
        to.map((address) => this.transport.send({ to: address, subject: `[${this.appName}] ${subject}`, text })),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.warn(`Could not email ${to[index]}: ${(result.reason as Error)?.message ?? result.reason}`);
        }
      });
      return results.filter((result) => result.status === 'fulfilled').length;
    } catch (error) {
      this.logger.warn(`Email not sent: ${(error as Error).message}`);
      return 0;
    }
  }

  // A link into the app, or nothing when the app's address is not configured.
  link(path: string, label: string): string {
    return this.appUrl ? `\n\n${label}: ${this.appUrl}${path}` : '';
  }

  private chooseTransport(config: ConfigService): MailTransport {
    if (config.get<string>('MAIL_TRANSPORT') !== 'smtp') {
      return new LogTransport();
    }
    const host = config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('MAIL_TRANSPORT=smtp but SMTP_HOST is not set; emails will only be logged');
      return new LogTransport();
    }
    return new SmtpTransport({
      host,
      port: Number(config.get<string>('SMTP_PORT') ?? 587),
      user: config.get<string>('SMTP_USER'),
      pass: config.get<string>('SMTP_PASS'),
      from: config.get<string>('MAIL_FROM') ?? `${this.appName} <no-reply@localhost>`,
    });
  }
}
