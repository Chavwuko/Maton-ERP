import { Logger } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { EmailNotifier } from './email-notifier';
import type { MailService } from './mail.service';

const ann = { firstName: 'Ann', lastName: 'Store', email: 'ann@acme.com' };
const booking = {
  id: 'appt-1',
  subject: 'Gloves',
  date: new Date('2026-10-26'),
  time: '09:00',
  status: 'APPROVED',
  feedback: 'See you then',
  issuedNote: null,
  requester: ann,
  feedbackBy: { firstName: 'Kay', lastName: 'Keeper', email: 'kay@acme.com' },
};

describe('EmailNotifier', () => {
  let prisma: MockPrisma;
  let mail: { send: jest.Mock; link: jest.Mock };
  let notifier: EmailNotifier;

  beforeEach(() => {
    prisma = createMockPrisma();
    mail = { send: jest.fn().mockResolvedValue(1), link: jest.fn((path: string, label: string) => `\n\n${label}: ${path}`) };
    notifier = new EmailNotifier(mail as unknown as MailService, prisma);
    prisma.user.findMany.mockResolvedValue([{ email: 'boss@acme.com' }, { email: 'kay@acme.com' }] as never);
  });

  it('finds active people with the given roles', async () => {
    await expect(notifier.emailsOf(['admin', 'inventory'])).resolves.toEqual(['boss@acme.com', 'kay@acme.com']);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', role: { name: { in: ['admin', 'inventory'] } } },
      select: { email: true },
    });
  });

  it('tells the admins about a new sign-up request, with a link to review it', async () => {
    await notifier.accessRequested(ann, 'Stores');

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ACTIVE', role: { name: { in: ['admin'] } } } }));
    expect(mail.send).toHaveBeenCalledWith(
      ['boss@acme.com', 'kay@acme.com'],
      'New sign-up request — Ann Store',
      expect.stringContaining('Review requests: /users?tab=requests'),
    );
  });

  it('tells a person they were approved or rejected', async () => {
    await notifier.accessApproved(ann, 'staff');
    await notifier.accessRejected(ann, 'Not ours');

    expect(mail.send).toHaveBeenNthCalledWith(1, ['ann@acme.com'], 'Your access has been approved', expect.stringContaining('as staff'));
    expect(mail.send).toHaveBeenNthCalledWith(2, ['ann@acme.com'], 'Your access request was not approved', expect.stringContaining('Reason: Not ours'));
  });

  it('tells the store about a booking and about the requester cancelling it', async () => {
    await notifier.bookingCreated(booking);
    await notifier.bookingCancelledByRequester(booking);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', role: { name: { in: ['admin', 'inventory'] } } } }),
    );
    expect(mail.send).toHaveBeenNthCalledWith(
      1,
      ['boss@acme.com', 'kay@acme.com'],
      'New appointment request — Gloves',
      expect.stringContaining('Open to review: /appointments?tab=all'),
    );
    expect(mail.send).toHaveBeenNthCalledWith(2, ['boss@acme.com', 'kay@acme.com'], 'Appointment cancelled — Gloves', expect.any(String));
  });

  it('tells the requester about a decision', async () => {
    await notifier.bookingDecided(booking);

    expect(mail.send).toHaveBeenCalledWith(
      ['ann@acme.com'],
      'Your appointment was approved — Gloves',
      expect.stringContaining('Open your bookings: /appointments?tab=mine'),
    );
  });

  it('tells the assignee about a preventive work order, or the maintenance team when nobody is assigned', async () => {
    const workOrder = { title: 'Grease bearings', assetTag: 'PUMP-1', assetName: 'Pump', dueDate: new Date('2026-11-01') };

    await notifier.scheduledWorkOrder({ ...workOrder, assignee: { email: 'tech@acme.com' } });
    await notifier.scheduledWorkOrder({ ...workOrder, assignee: null });

    expect(mail.send).toHaveBeenNthCalledWith(
      1,
      ['tech@acme.com'],
      'Preventive maintenance due — Grease bearings (PUMP-1)',
      expect.stringContaining('Open work orders: /maintenance'),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ACTIVE', role: { name: { in: ['maintenance'] } } } }));
    expect(mail.send).toHaveBeenNthCalledWith(2, ['boss@acme.com', 'kay@acme.com'], expect.any(String), expect.any(String));
  });

  it('never throws: a failed lookup or send is logged and swallowed', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.user.findMany.mockRejectedValue(new Error('db down'));

    await expect(notifier.bookingCreated(booking)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Notification bookingCreated failed: db down');

    mail.send.mockRejectedValue(new Error('smtp down'));
    await expect(notifier.accessApproved(ann, 'staff')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Notification accessApproved failed: smtp down');
    warn.mockRestore();
  });
});
