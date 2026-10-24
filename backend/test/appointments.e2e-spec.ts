import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Booking, reviewing and completing appointments, including the part that
// matters most: completing one issues stock through the same engine as the
// Consumption screen, tagged with the appointment.
describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let keeper: ReturnType<typeof asRole>;
  let staff: ReturnType<typeof asRole>;
  let stranger: ReturnType<typeof asRole>;
  let orgId: string;
  let deptId: string;
  let whId: string;
  let projectId: string;
  let itemId: string;

  const run = Date.now();
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const weekday = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
  // A random working day a week or more away, so repeated runs against the
  // same database do not collide, and a Saturday for the non-working case.
  const pick = (test: (dow: number) => boolean, from: number) => {
    for (let offset = from; ; offset++) {
      if (test(weekday(day(offset)))) return day(offset);
    }
  };
  const bookingDay = pick((dow) => dow >= 1 && dow <= 5, 7 + Math.floor(Math.random() * 40));
  const saturday = pick((dow) => dow === 6, 7);
  const times = Array.from({ length: 18 }, (_, i) => {
    const minutes = 8 * 60 + i * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  });
  const base = Math.floor(Math.random() * 6);
  const slot = (n: number) => times[base + n];

  const onHand = async () =>
    (await admin.get(`/inventory-items/${itemId}`)).body.stockLevels.reduce(
      (sum: number, level: { quantityOnHand: number }) => sum + level.quantityOnHand,
      0,
    );

  const book = (who: ReturnType<typeof asRole>, overrides: Record<string, unknown> = {}) =>
    who.post('/appointments').send({
      date: bookingDay,
      time: slot(0),
      type: 'Item collection / issue',
      subject: `Collect gloves ${run}`,
      items: [{ itemId, quantity: 3 }],
      ...overrides,
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    keeper = asRole(app, 'inventory');
    staff = asRole(app, 'staff');
    stranger = asRole(app, 'hse');

    orgId = (await admin.post('/organizations').send({ name: `ApptCo ${run}` })).body.id;
    deptId = (await admin.post('/departments').send({ organizationId: orgId, code: `AP${run}`, name: 'Workshop' })).body.id;
    whId = (await admin.post('/warehouses').send({ organizationId: orgId, code: 'MAIN', name: 'Main store' })).body.id;
    projectId = (await admin.post('/projects').send({ organizationId: orgId, code: `P${run}`, name: 'Substation' })).body.id;
    itemId = (
      await keeper.post('/inventory-items').send({
        organizationId: orgId,
        sku: `GLV-${run}`,
        name: 'Work gloves',
        unitOfMeasure: 'pcs',
        unitCost: 2,
        openingStock: 50,
        openingWarehouseId: whId,
      })
    ).body.id;

    const schedule = await request(app.getHttpServer())
      .put('/appointments/schedule')
      .set('x-local-role', 'admin')
      .send({ workStart: '08:00', workEnd: '17:00', slotMinutes: 30, slotCapacity: 5, workingDays: [1, 2, 3, 4, 5], timeZone: 'Africa/Lagos' });
    expect(schedule.status).toBe(200);
  });

  afterAll(async () => {
    await request(app.getHttpServer()).put('/appointments/schedule').set('x-local-role', 'admin').send({ slotCapacity: 1 });
    // The signed-up test user's appointments (and the stock issues they led
    // to) point at them, so detach and remove those before the user.
    const theirs = { requester: { email: { endsWith: `@appt-${run}.test` } } };
    await prisma.consumption.updateMany({ where: { appointment: theirs }, data: { appointmentId: null } });
    await prisma.appointment.deleteMany({ where: theirs });
    await prisma.user.deleteMany({ where: { email: { endsWith: `@appt-${run}.test` } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('schedule', () => {
    it('is readable by anyone but editable only by admin', async () => {
      const read = await staff.get('/appointments/schedule');
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ workStart: '08:00', slotMinutes: 30, workingDays: [1, 2, 3, 4, 5] });

      const put = (who: string, body: object) =>
        request(app.getHttpServer()).put('/appointments/schedule').set('x-local-role', who).send(body);
      expect((await put('inventory', { slotCapacity: 2 })).status).toBe(403);
      expect((await put('admin', { slotMinutes: 7 })).status).toBe(400);
      expect((await put('admin', { timeZone: 'Mars/Olympus' })).status).toBe(400);
      expect((await put('admin', { workingDays: [] })).status).toBe(400);
    });
  });

  describe('slots', () => {
    it('says a non-working day has no slots', async () => {
      const res = await staff.get(`/appointments/slots?date=${saturday}`);

      expect(res.body).toEqual({ working: false, slots: [] });
    });

    it('lists the day\'s slots, all open, and rejects a bad date', async () => {
      const res = await staff.get(`/appointments/slots?date=${bookingDay}`);

      expect(res.status).toBe(200);
      expect(res.body.slots).toHaveLength(18);
      expect(res.body.slots.every((s: { available: boolean }) => s.available)).toBe(true);
      expect((await staff.get('/appointments/slots?date=soon')).status).toBe(400);
    });
  });

  describe('booking', () => {
    it('books a pending appointment with its items, and the slot count goes up', async () => {
      const res = await book(staff);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'PENDING', time: slot(0), subject: `Collect gloves ${run}` });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ quantity: 3, item: { sku: `GLV-${run}` } });

      const slots = await staff.get(`/appointments/slots?date=${bookingDay}`);
      expect(slots.body.slots.find((s: { time: string }) => s.time === slot(0))).toMatchObject({ booked: 1, available: true });
    });

    it('refuses a second booking at the same time by the same person', async () => {
      const res = await book(staff);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('You already have an appointment at that time');
    });

    it.each([
      ['a past date', { date: '2020-01-06' }, 'future date'],
      ['a non-working day', { date: 'SATURDAY' }, 'working days'],
      ['an off-grid time', { time: '09:15' }, 'valid time slot'],
      ['no subject', { subject: ' ' }, 'subject'],
      ['an unknown item', { items: [{ itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] }, 'not found'],
      ['a zero quantity', { items: [{ itemId: 'ITEM', quantity: 0 }] }, 'positive quantity'],
    ])('refuses %s', async (_label, overrides, message) => {
      const body = JSON.parse(
        JSON.stringify(overrides).replace('SATURDAY', saturday).replace('ITEM', itemId),
      );

      const res = await book(stranger, { time: slot(5), ...body });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.message).toContain(message);
    });

    it('keeps each person\'s list to themselves, while the store sees everything', async () => {
      expect((await staff.get('/appointments/mine')).body.some((a: { subject: string }) => a.subject === `Collect gloves ${run}`)).toBe(true);
      expect((await stranger.get('/appointments/mine')).body.some((a: { subject: string }) => a.subject === `Collect gloves ${run}`)).toBe(false);

      expect((await staff.get('/appointments')).status).toBe(403);
      const all = await keeper.get('/appointments').query({ status: 'PENDING', from: bookingDay, to: bookingDay });
      expect(all.status).toBe(200);
      expect(all.body.some((a: { subject: string }) => a.subject === `Collect gloves ${run}`)).toBe(true);
      expect((await keeper.get('/appointments').query({ status: 'LOST' })).status).toBe(400);
    });
  });

  describe('reviewing and completing', () => {
    let apptId: string;

    beforeAll(async () => {
      apptId = (await book(staff, { time: slot(1), subject: `Needs PPE ${run}` })).body.id;
    });

    it('is for the store only', async () => {
      const res = await staff.post(`/appointments/${apptId}/review`).send({ decision: 'APPROVED' });

      expect(res.status).toBe(403);
    });

    it('approves, recording who and when', async () => {
      const res = await keeper.post(`/appointments/${apptId}/review`).send({ decision: 'APPROVED', feedback: 'Bring your site pass' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'APPROVED', feedback: 'Bring your site pass' });
      expect(res.body.feedbackBy.email).toBe('inventory@local.dev');
      expect(res.body.feedbackAt).toBeTruthy();
    });

    it('validates the decision and what completing needs', async () => {
      const review = (body: object) => keeper.post(`/appointments/${apptId}/review`).send(body);
      const issue = [{ itemId, quantity: 3 }];

      expect((await review({ decision: 'MAYBE' })).status).toBe(400);
      expect((await review({ decision: 'COMPLETED' })).body.message).toBe('Please add feedback for the requester');
      expect((await review({ decision: 'COMPLETED', feedback: 'Done', issue })).body.message).toMatch(/warehouse/);
      // This requester has no department, so something must be charged.
      expect((await review({ decision: 'COMPLETED', feedback: 'Done', warehouseId: whId, issue })).body.message).toMatch(
        /no department/,
      );
      expect((await review({ decision: 'APPROVED' })).body.message).toBe('This appointment is already approved');
    });

    it('does nothing at all when the stock is short', async () => {
      const before = await onHand();

      const res = await keeper.post(`/appointments/${apptId}/review`).send({
        decision: 'COMPLETED',
        feedback: 'Done',
        warehouseId: whId,
        projectId,
        issue: [{ itemId, quantity: 4000 }],
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Insufficient stock/);
      expect(await onHand()).toBe(before);
      const still = await keeper.get('/appointments').query({ status: 'APPROVED', from: bookingDay, to: bookingDay });
      expect(still.body.some((a: { id: string }) => a.id === apptId)).toBe(true);
    });

    it('completes, issuing the items to the project and tagging them with the appointment', async () => {
      const before = await onHand();

      const res = await keeper.post(`/appointments/${apptId}/review`).send({
        decision: 'COMPLETED',
        feedback: 'Handed over',
        warehouseId: whId,
        projectId,
        issue: [{ itemId, quantity: 3 }],
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'COMPLETED', issuedNote: 'Issued: 3 pcs Work gloves' });
      expect(await onHand()).toBe(before - 3);

      const consumptions = await admin.get(`/consumptions?projectId=${projectId}`);
      const issued = consumptions.body.find((c: { appointmentId: string }) => c.appointmentId === apptId);
      expect(issued).toMatchObject({ quantity: 3, issuedTo: 'Local Dev', purpose: `Needs PPE ${run}`, projectId });

      const ledger = await admin.get(`/stock-transactions?itemId=${itemId}&type=ISSUE`);
      expect(ledger.body.some((t: { refId: string }) => t.refId === issued.id)).toBe(true);

      expect((await keeper.post(`/appointments/${apptId}/review`).send({ decision: 'DECLINED', feedback: 'x' })).status).toBe(400);
    });

    it('declines with feedback', async () => {
      const id = (await book(staff, { time: slot(2), subject: `Decline me ${run}` })).body.id;

      expect((await keeper.post(`/appointments/${id}/review`).send({ decision: 'DECLINED' })).status).toBe(400);
      const res = await keeper.post(`/appointments/${id}/review`).send({ decision: 'DECLINED', feedback: 'Come back Monday' });

      expect(res.body).toMatchObject({ status: 'DECLINED', feedback: 'Come back Monday' });
    });

    it('404s for an unknown appointment', async () => {
      expect((await keeper.post('/appointments/00000000-0000-0000-0000-000000000000/review').send({ decision: 'APPROVED' })).status).toBe(404);
    });
  });

  describe('cancelling', () => {
    it('lets the requester cancel their own, but nobody else cancel it for them', async () => {
      const id = (await book(staff, { time: slot(3), subject: `Cancel me ${run}` })).body.id;

      expect((await stranger.post(`/appointments/${id}/cancel`)).status).toBe(403);
      const res = await staff.post(`/appointments/${id}/cancel`);
      expect(res.body.status).toBe('CANCELLED');
      expect((await staff.post(`/appointments/${id}/cancel`)).body.message).toBe('This appointment is already cancelled');

      // The freed slot can be booked again.
      expect((await book(staff, { time: slot(3), subject: `Again ${run}` })).status).toBe(201);
    });

    it('lets the store cancel someone else\'s, saying so', async () => {
      const id = (await book(staff, { time: slot(4), subject: `Store cancels ${run}` })).body.id;

      const res = await keeper.post(`/appointments/${id}/cancel`);

      expect(res.body).toMatchObject({ status: 'CANCELLED', feedback: 'Cancelled by the store.' });
    });

    it('404s for an unknown appointment', async () => {
      expect((await staff.post('/appointments/00000000-0000-0000-0000-000000000000/cancel')).status).toBe(404);
    });
  });

  describe('charging the requester\'s department', () => {
    it('uses the department on their record when no project is given', async () => {
      const email = `dept.user@appt-${run}.test`;
      const signup = (path: 'get' | 'post', url: string) => request(app.getHttpServer())[path](url).set('x-local-signup', email);
      await signup('get', '/auth/me');
      const { id: userId } = await prisma.user.findUniqueOrThrow({ where: { email } });
      await admin.post(`/users/${userId}/approve`).send({ roleName: 'staff', departmentId: deptId });

      const booked = await signup('post', '/appointments').send({
        date: bookingDay,
        time: slot(6),
        subject: `Dept booking ${run}`,
        items: [{ itemId, quantity: 2 }],
      });
      expect(booked.status).toBe(201);
      expect(booked.body.department).toMatchObject({ id: deptId });

      const done = await keeper.post(`/appointments/${booked.body.id}/review`).send({
        decision: 'COMPLETED',
        feedback: 'Collected',
        warehouseId: whId,
        issue: [{ itemId, quantity: 2 }],
      });
      expect(done.status).toBe(201);

      const consumptions = await admin.get(`/consumptions?departmentId=${deptId}`);
      expect(consumptions.body.find((c: { appointmentId: string }) => c.appointmentId === booked.body.id)).toMatchObject({
        departmentId: deptId,
        quantity: 2,
        issuedTo: email,
      });
    });
  });
});
