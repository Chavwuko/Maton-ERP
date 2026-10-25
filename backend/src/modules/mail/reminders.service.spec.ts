import { Logger } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { claimReminderDay } from '../settings/email-settings';
import type { EmailNotifier } from './email-notifier';
import type { MailService } from './mail.service';
import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  let prisma: MockPrisma;
  let mail: { send: jest.Mock; link: jest.Mock };
  let notifier: { emailsOf: jest.Mock };
  let service: RemindersService;

  const at = (iso: string) =>
    jest.useFakeTimers({
      now: new Date(iso),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.appSetting.findMany.mockResolvedValue([]); // schedule: Africa/Lagos
    prisma.appSetting.findUnique.mockResolvedValue(null); // no day claimed yet
    mail = { send: jest.fn().mockResolvedValue(1), link: jest.fn(() => '\n\nlink') };
    notifier = { emailsOf: jest.fn().mockResolvedValue(['boss@acme.com']) };
    service = new RemindersService(prisma, mail as unknown as MailService, notifier as unknown as EmailNotifier);
    prisma.user.findMany.mockResolvedValue([
      { firstName: 'Pat', lastName: 'Pending', email: 'pat@acme.com' },
    ] as never);
    prisma.appointment.findMany.mockResolvedValue([
      { subject: 'Gloves', date: new Date('2026-10-26'), time: '09:00', requester: { firstName: 'Ann', lastName: 'Store', email: 'ann@acme.com' } },
    ] as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sendReminder', () => {
    it('emails the admins about everything waiting more than a day', async () => {
      const now = new Date('2026-10-24T08:00:00.000Z');

      await expect(service.sendReminder(now)).resolves.toBe(2);

      const cutoff = new Date('2026-10-23T08:00:00.000Z');
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDING', createdAt: { lt: cutoff } } }));
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDING', createdAt: { lt: cutoff } } }));
      expect(notifier.emailsOf).toHaveBeenCalledWith(['admin']);
      expect(mail.send).toHaveBeenCalledWith(
        ['boss@acme.com'],
        'Reminder: 2 items waiting for you',
        expect.stringContaining('Pat Pending (pat@acme.com)'),
      );
    });

    it('sends nothing when nothing has been waiting', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);
      prisma.appointment.findMany.mockResolvedValue([] as never);

      await expect(service.sendReminder()).resolves.toBe(0);

      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('hourly', () => {
    it('sends the reminder in the 8 o\'clock hour, Lagos time, once per day', async () => {
      at('2026-10-24T07:10:00.000Z'); // 08:10 in Lagos

      await expect(service.hourly()).resolves.toBe(2);

      expect(prisma.appSetting.create).toHaveBeenCalledWith({ data: { key: 'email.lastReminderDate', value: '2026-10-24' } });
    });

    it('does nothing in any other hour', async () => {
      at('2026-10-24T10:00:00.000Z');

      await expect(service.hourly()).resolves.toBe(0);

      expect(prisma.appSetting.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('does nothing when another server already sent today\'s', async () => {
      at('2026-10-24T07:10:00.000Z');
      prisma.appSetting.findUnique.mockResolvedValue({ key: 'email.lastReminderDate', value: '2026-10-24' } as never);

      await expect(service.hourly()).resolves.toBe(0);

      expect(mail.send).not.toHaveBeenCalled();
    });

    it('logs and returns 0 when the run fails', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      at('2026-10-24T07:10:00.000Z');
      prisma.appSetting.findMany.mockRejectedValue(new Error('db down'));

      await expect(service.hourly()).resolves.toBe(0);

      expect(warn).toHaveBeenCalledWith('Reminder run failed: db down');
      warn.mockRestore();
    });
  });
});

describe('claimReminderDay', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('claims a day nobody has claimed', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);

    await expect(claimReminderDay(prisma, '2026-10-24')).resolves.toBe(true);
  });

  it('loses to a server that creates the row first', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    prisma.appSetting.create.mockRejectedValue(new Error('unique constraint'));

    await expect(claimReminderDay(prisma, '2026-10-24')).resolves.toBe(false);
  });

  it('claims a new day by moving the stored one forward, only if nobody else did first', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: 'email.lastReminderDate', value: '2026-10-23' } as never);
    prisma.appSetting.updateMany.mockResolvedValue({ count: 1 } as never);
    await expect(claimReminderDay(prisma, '2026-10-24')).resolves.toBe(true);
    expect(prisma.appSetting.updateMany).toHaveBeenCalledWith({
      where: { key: 'email.lastReminderDate', value: '2026-10-23' },
      data: { value: '2026-10-24' },
    });

    prisma.appSetting.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(claimReminderDay(prisma, '2026-10-24')).resolves.toBe(false);
  });

  it('does not claim a day twice', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: 'email.lastReminderDate', value: '2026-10-24' } as never);

    await expect(claimReminderDay(prisma, '2026-10-24')).resolves.toBe(false);
  });
});
