import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { isDeliverable, MailService } from './mail.service';
import { LogTransport, SmtpTransport } from './mail.transport';

jest.mock('nodemailer');

const config = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('isDeliverable', () => {
  it.each(['ann@acme.com', 'Ann.Lee@Company.co.uk', ' spaced@acme.com '])('accepts %s', (email) => {
    expect(isDeliverable(email)).toBe(true);
  });

  it.each([null, undefined, '', 'no-at-sign', 'x@example.com', 'x@EXAMPLE.org', 'x@example.net', 'admin@local.dev', 'a@acme.test', 'a@b.invalid', 'a@b.example', 'a@app.localhost'])(
    'rejects %s',
    (email) => {
      expect(isDeliverable(email)).toBe(false);
    },
  );
});

describe('MailService', () => {
  let prisma: MockPrisma;
  let sent: { to: string; subject: string; text: string }[];

  const build = (values: Record<string, string> = {}) => {
    const service = new MailService(config(values), prisma);
    service.transport = {
      kind: 'log',
      send: jest.fn(async (message) => {
        sent.push(message);
      }),
    };
    return service;
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.appSetting.findUnique.mockResolvedValue(null); // emails on
    sent = [];
  });

  describe('send', () => {
    it('emails each real recipient once, with the app name in the subject and a sign-off', async () => {
      const service = build({ APP_NAME: 'Store Co' });

      const count = await service.send(['ann@acme.com', 'ann@acme.com', 'ben@acme.com', 'ghost@acme.test', null, undefined], 'Hello', 'Body');

      expect(count).toBe(2);
      expect(sent.map((m) => m.to)).toEqual(['ann@acme.com', 'ben@acme.com']);
      expect(sent[0]).toEqual({ to: 'ann@acme.com', subject: '[Store Co] Hello', text: 'Body\n\n— Store Co' });
    });

    it('sends nothing when an admin has turned email off', async () => {
      prisma.appSetting.findUnique.mockResolvedValue({ key: 'email.enabled', value: 'false' } as never);
      const service = build();

      await expect(service.send(['ann@acme.com'], 'Hi', 'x')).resolves.toBe(0);

      expect(sent).toEqual([]);
    });

    it('sends nothing when every recipient is a test address', async () => {
      const service = build();

      await expect(service.send(['a@local.dev', 'b@example.com'], 'Hi', 'x')).resolves.toBe(0);
    });

    it('logs a failed recipient and still reaches the others', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const service = build();
      (service.transport.send as jest.Mock).mockImplementation(async (message) => {
        if (message.to === 'bad@acme.com') throw new Error('mailbox full');
        sent.push(message);
      });

      const count = await service.send(['bad@acme.com', 'ok@acme.com'], 'Hi', 'x');

      expect(count).toBe(1);
      expect(sent.map((m) => m.to)).toEqual(['ok@acme.com']);
      expect(warn).toHaveBeenCalledWith('Could not email bad@acme.com: mailbox full');
      warn.mockRestore();
    });

    it('describes a non-error rejection too', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const service = build();
      (service.transport.send as jest.Mock).mockRejectedValue('plain string');

      await service.send(['a@acme.com'], 'Hi', 'x');

      expect(warn).toHaveBeenCalledWith('Could not email a@acme.com: plain string');
      warn.mockRestore();
    });

    it('never throws, even when the settings cannot be read', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
      const service = build();

      await expect(service.send(['a@acme.com'], 'Hi', 'x')).resolves.toBe(0);

      expect(warn).toHaveBeenCalledWith('Email not sent: db down');
      warn.mockRestore();
    });
  });

  describe('link', () => {
    it('points into the app, tolerating a trailing slash', () => {
      const service = build({ FRONTEND_URL: 'https://app.acme.com/' });

      expect(service.link('/users?tab=requests', 'Review')).toBe('\n\nReview: https://app.acme.com/users?tab=requests');
    });

    it('adds nothing when the app address is not configured', () => {
      expect(build().link('/x', 'Open')).toBe('');
    });
  });

  describe('transport choice', () => {
    it('only logs by default', () => {
      expect(new MailService(config(), prisma).transport).toBeInstanceOf(LogTransport);
    });

    it('uses SMTP when asked and a host is given', () => {
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: jest.fn() });

      const service = new MailService(
        config({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.acme.com', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'Store <store@acme.com>' }),
        prisma,
      );

      expect(service.transport).toBeInstanceOf(SmtpTransport);
      expect(service.transport.kind).toBe('smtp');
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.acme.com',
        port: 465,
        secure: true,
        auth: { user: 'u', pass: 'p' },
      });
    });

    it('defaults the port and sender, and warns and falls back to logging when the host is missing', () => {
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: jest.fn() });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const withHost = new MailService(config({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.acme.com' }), prisma);
      expect(withHost.transport.kind).toBe('smtp');
      expect(nodemailer.createTransport).toHaveBeenLastCalledWith({ host: 'smtp.acme.com', port: 587, secure: false, auth: undefined });

      const withoutHost = new MailService(config({ MAIL_TRANSPORT: 'smtp' }), prisma);
      expect(withoutHost.transport).toBeInstanceOf(LogTransport);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST is not set'));
      warn.mockRestore();
    });
  });
});
