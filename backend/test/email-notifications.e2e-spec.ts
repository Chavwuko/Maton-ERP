import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/modules/mail/mail.service';
import { RemindersService } from '../src/modules/mail/reminders.service';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// The emails sent around sign-up approval and bookings, captured instead of
// delivered. Everyone here uses an @mailtest.dev address: the app skips the
// fake domains the other suites use (.test, local.dev), so these are the only
// recipients that count.
describe('Email notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let outbox: { to: string; subject: string; text: string }[];
  const run = Date.now();
  const domain = 'mailtest.dev';
  const storeAdmin = `store.${run}@${domain}`;
  const pat = `pat.${run}@${domain}`;

  const asSignup = (who: string) => {
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('x-local-signup', who),
      post: (url: string) => request(server).post(url).set('x-local-signup', who),
    };
  };
  const idOf = async (who: string) => (await prisma.user.findUniqueOrThrow({ where: { email: who } })).id;
  const mailTo = (to: string) => outbox.filter((m) => m.to === to);

  // Mail goes out just after the response, so wait for it to arrive.
  async function waitFor(condition: () => boolean) {
    for (let attempt = 0; attempt < 30 && !condition(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    outbox = [];
    app.get(MailService).transport = {
      kind: 'log',
      send: async (message) => {
        outbox.push(message);
      },
    };
    await request(app.getHttpServer()).put('/settings/email').set('x-local-role', 'admin').send({ enabled: true });

    // Someone the store emails: an active admin with a real-looking address.
    await asSignup(storeAdmin).get('/auth/me');
    await admin.post(`/users/${await idOf(storeAdmin)}/approve`).send({ roleName: 'admin' });
  });

  afterAll(async () => {
    await request(app.getHttpServer()).put('/settings/email').set('x-local-role', 'admin').send({ enabled: true });
    const theirs = { requester: { email: { endsWith: `@${domain}` } } };
    await prisma.consumption.updateMany({ where: { appointment: theirs }, data: { appointmentId: null } });
    await prisma.appointment.deleteMany({ where: theirs });
    await prisma.user.deleteMany({ where: { email: { endsWith: `.${run}@${domain}` } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('sign-up', () => {
    it('tells the admins when a new request arrives, once, and the person when it is decided', async () => {
      await asSignup(pat).get('/auth/me');
      await asSignup(pat).post('/auth/request-access').send({ firstName: 'Pat', lastName: 'Pending' });
      await waitFor(() => mailTo(storeAdmin).some((m) => m.subject.includes('New sign-up request')));

      const request1 = mailTo(storeAdmin).filter((m) => m.subject === '[ERP Foundations] New sign-up request — Pat Pending');
      expect(request1).toHaveLength(1);
      expect(request1[0].text).toContain(`(${pat}) has asked for access`);
      expect(request1[0].text.endsWith('— ERP Foundations')).toBe(true);

      // Editing the request while waiting does not email the admins again.
      await asSignup(pat).post('/auth/request-access').send({ firstName: 'Pat', lastName: 'Edited' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(mailTo(storeAdmin).filter((m) => m.subject.includes('New sign-up request'))).toHaveLength(1);

      await admin.post(`/users/${await idOf(pat)}/approve`).send({ roleName: 'staff' });
      await waitFor(() => mailTo(pat).length > 0);
      expect(mailTo(pat)[0].subject).toBe('[ERP Foundations] Your access has been approved');
      expect(mailTo(pat)[0].text).toContain('approved as staff');
    });

    it('tells a rejected person why', async () => {
      const nope = `nope.${run}@${domain}`;
      await asSignup(nope).get('/auth/me');

      await admin.post(`/users/${await idOf(nope)}/reject`).send({ reason: 'Not a contractor of ours' });
      await waitFor(() => mailTo(nope).length > 0);

      expect(mailTo(nope)[0].subject).toBe('[ERP Foundations] Your access request was not approved');
      expect(mailTo(nope)[0].text).toContain('Reason: Not a contractor of ours');
    });
  });

  describe('bookings', () => {
    const day = (() => {
      for (let offset = 14 + Math.floor(Math.random() * 30); ; offset++) {
        const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (weekday >= 1 && weekday <= 5) return date;
      }
    })();
    const slot = Math.floor(Math.random() * 8);
    const time = (n: number) => `${String(8 + Math.floor((slot + n) / 2)).padStart(2, '0')}:${(slot + n) % 2 ? '30' : '00'}`;
    const book = (n: number, subject: string) =>
      asSignup(pat).post('/appointments').send({ date: day, time: time(n), subject });

    beforeAll(async () => {
      await request(app.getHttpServer()).put('/appointments/schedule').set('x-local-role', 'admin').send({ slotCapacity: 5 });
    });

    it('tells the store about a booking, and the requester about the decision', async () => {
      const booked = await book(0, `Gloves ${run}`);
      expect(booked.status).toBe(201);
      await waitFor(() => mailTo(storeAdmin).some((m) => m.subject.includes(`Gloves ${run}`)));

      const toStore = mailTo(storeAdmin).find((m) => m.subject.includes(`Gloves ${run}`))!;
      expect(toStore.subject).toBe(`[ERP Foundations] New appointment request — Gloves ${run}`);
      expect(toStore.text).toContain(`booked "Gloves ${run}" for ${day} at ${time(0)}`);

      await admin.post(`/appointments/${booked.body.id}/review`).send({ decision: 'APPROVED', feedback: 'Bring your site pass' });
      await waitFor(() => mailTo(pat).some((m) => m.subject.includes('was approved —')));

      const toRequester = mailTo(pat).find((m) => m.subject.includes('was approved —'))!;
      expect(toRequester.subject).toBe(`[ERP Foundations] Your appointment was approved — Gloves ${run}`);
      expect(toRequester.text).toContain('Bring your site pass');
    });

    it('tells the store when the requester cancels, and the requester when the store does', async () => {
      const mine = await book(1, `Mine ${run}`);
      await asSignup(pat).post(`/appointments/${mine.body.id}/cancel`);
      await waitFor(() => mailTo(storeAdmin).some((m) => m.subject.includes(`cancelled — Mine ${run}`)));
      expect(mailTo(storeAdmin).some((m) => m.subject === `[ERP Foundations] Appointment cancelled — Mine ${run}`)).toBe(true);

      const theirs = await book(2, `Theirs ${run}`);
      await admin.post(`/appointments/${theirs.body.id}/cancel`);
      await waitFor(() => mailTo(pat).some((m) => m.subject.includes(`cancelled — Theirs ${run}`)));
      const email = mailTo(pat).find((m) => m.subject.includes(`cancelled — Theirs ${run}`))!;
      expect(email.text).toContain('cancelled by the store');
    });
  });

  describe('the master switch', () => {
    it('is admin only, and reports whether mail really goes out', async () => {
      const put = (role: string, body: object) =>
        request(app.getHttpServer()).put('/settings/email').set('x-local-role', role).send(body);

      expect((await asRole(app, 'inventory').get('/settings/email')).status).toBe(403);
      expect((await put('inventory', { enabled: false })).status).toBe(403);
      expect((await put('admin', { enabled: 'no' })).status).toBe(400);
      const read = await admin.get('/settings/email');
      expect(read.body).toEqual({ enabled: true, transport: 'log' });
    });

    it('stops all email when turned off, and resumes when turned back on', async () => {
      const put = (enabled: boolean) => request(app.getHttpServer()).put('/settings/email').set('x-local-role', 'admin').send({ enabled });
      const quiet = `quiet.${run}@${domain}`;
      await asSignup(quiet).get('/auth/me');

      expect((await put(false)).body.enabled).toBe(false);
      await admin.post(`/users/${await idOf(quiet)}/approve`).send({ roleName: 'staff' });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(mailTo(quiet)).toEqual([]);

      expect((await put(true)).body.enabled).toBe(true);
      const loud = `loud.${run}@${domain}`;
      await asSignup(loud).get('/auth/me');
      await admin.post(`/users/${await idOf(loud)}/approve`).send({ roleName: 'staff' });
      await waitFor(() => mailTo(loud).length > 0);
      expect(mailTo(loud)).toHaveLength(1);
    });
  });

  describe('the daily reminder', () => {
    it('tells the admins what has been waiting more than a day', async () => {
      const waiting = `waiting.${run}@${domain}`;
      await asSignup(waiting).get('/auth/me');
      outbox.length = 0;

      // Pretend it is two days later, so the request above counts as old.
      const listed = await app.get(RemindersService).sendReminder(new Date(Date.now() + 2 * 86_400_000));

      expect(listed).toBeGreaterThanOrEqual(1);
      const reminder = mailTo(storeAdmin).find((m) => m.subject.startsWith('[ERP Foundations] Reminder:'))!;
      expect(reminder.text).toContain(`(${waiting})`);
      expect(reminder.text).toContain('These have been waiting for more than 24 hours:');
    });
  });
});
