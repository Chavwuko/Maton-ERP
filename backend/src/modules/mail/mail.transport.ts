import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  readonly kind: 'log' | 'smtp';
  send(message: MailMessage): Promise<void>;
}

// Development default: nothing leaves the machine, the email is just written
// to the log so the flow can be seen working.
export class LogTransport implements MailTransport {
  readonly kind = 'log' as const;
  private readonly logger = new Logger('Mail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`To ${message.to} | ${message.subject}\n${message.text}`);
  }
}

export interface SmtpOptions {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

// Any SMTP server works: Amazon SES's SMTP interface, a company mail server,
// or Mailpit in docker-compose for local testing.
export class SmtpTransport implements MailTransport {
  readonly kind = 'smtp' as const;
  private readonly client: nodemailer.Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.client = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: options.user ? { user: options.user, pass: options.pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.client.sendMail({ from: this.options.from, to: message.to, subject: message.subject, text: message.text });
  }
}
