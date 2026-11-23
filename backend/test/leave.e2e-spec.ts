import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

const iso = (date: Date) => date.toISOString().slice(0, 10);
const plus = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
// A Monday at least three weeks away, so nothing here starts in the past.
const monday = (() => {
  let day = plus(new Date(), 21);
  while (day.getUTCDay() !== 1) day = plus(day, 1);
  return day;
})();

// Filing leave and taking it through the supervisor or head, HR and the
// executive director, plus the "who is on leave" dashboard, on the real database.
describe('Leave (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const run = Date.now();
  // Each person is a local-dev role of their own, so they are separate users.
  const roles = {
    eve: `leave_eve_${run}`, // files leave
    sam: `leave_sam_${run}`, // Eve's supervisor
    head: `leave_head_${run}`, // heads Eve's department
    solo: `leave_solo_${run}`, // nobody above them
    nobody: `leave_nobody_${run}`, // no employee record
  };
  const as = (role: string) => asRole(app, role);
  const hr = () => as('hr');
  const director = () => as('executive_director');
  const admin = () => as('admin');

  let orgId: string;
  let deptId: string;
  let annualId: string;
  let sickId: string;

  async function provision(role: string, departmentId?: string) {
    await as(role).get('/leave/access');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `${role}@local.dev` } });
    if (departmentId) await prisma.user.update({ where: { id: user.id }, data: { departmentId } });
    return user.id;
  }
  const employee = (userId: string, n: number, managerId?: string) =>
    prisma.employee.create({
      data: { organizationId: orgId, userId, employeeNumber: `LV-${run}-${n}`, jobTitle: 'Operator', hireDate: new Date('2025-01-01'), managerId },
    });

  const file = (role: string, start: Date, end: Date, extra: object = {}) =>
    as(role).post('/leave/requests').send({ leaveTypeId: annualId, startDate: iso(start), endDate: iso(end), ...extra });
  const decide = (role: string, id: string, decision: string, comment?: string) =>
    as(role).post(`/leave/requests/${id}/decision`).send({ decision, comment });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();

    orgId = (await admin().post('/organizations').send({ name: `LeaveCo ${run}` })).body.id;
    deptId = (await admin().post('/departments').send({ organizationId: orgId, code: `LV${run}`, name: 'Plant' })).body.id;

    const eveId = await provision(roles.eve, deptId);
    const samId = await provision(roles.sam, deptId);
    const headId = await provision(roles.head, deptId);
    const soloId = await provision(roles.solo);
    await provision(roles.nobody);
    await provision('hr');
    await provision('executive_director');

    const sam = await employee(samId, 1);
    await employee(eveId, 2, sam.id);
    await employee(headId, 3);
    await employee(soloId, 4);
    await admin().patch(`/departments/${deptId}`).send({ headId });

    const types = await hr().post('/leave/types/defaults').send({ organizationId: orgId });
    annualId = types.body.find((type: { name: string }) => type.name === 'Annual leave').id;
    sickId = types.body.find((type: { name: string }) => type.name === 'Sick leave').id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('leave types', () => {
    it('are set up by HR, with the standard ones to start from', async () => {
      const list = await as(roles.eve).get(`/leave/types?organizationId=${orgId}`);

      expect(list.status).toBe(200);
      expect(list.body.map((type: { name: string }) => type.name)).toEqual(expect.arrayContaining(['Annual leave', 'Sick leave', 'Unpaid leave']));
      expect(list.body.find((type: { name: string }) => type.name === 'Annual leave')).toMatchObject({ daysPerYear: 21, paid: true });
      // Asking again adds nothing twice.
      const again = await hr().post('/leave/types/defaults').send({ organizationId: orgId });
      expect(again.body).toHaveLength(list.body.length);
    });

    it('can be added, changed and switched off by HR only', async () => {
      expect((await as(roles.eve).post('/leave/types').send({ organizationId: orgId, name: 'Nope' })).status).toBe(403);

      const made = await hr().post('/leave/types').send({ organizationId: orgId, name: `Study ${run}`, daysPerYear: 5 });
      expect(made.status).toBe(201);
      expect((await hr().post('/leave/types').send({ organizationId: orgId, name: `Study ${run}` })).status).toBe(409);

      const off = await hr().patch(`/leave/types/${made.body.id}`).send({ active: false });
      expect(off.body.active).toBe(false);
      const visible = await as(roles.eve).get(`/leave/types?organizationId=${orgId}`);
      expect(visible.body.map((type: { id: string }) => type.id)).not.toContain(made.body.id);
      const all = await hr().get(`/leave/types?organizationId=${orgId}&all=true`);
      expect(all.body.map((type: { id: string }) => type.id)).toContain(made.body.id);
      expect((await as(roles.eve).patch(`/leave/types/${made.body.id}`).send({ active: true })).status).toBe(403);
    });
  });

  describe('what each person can see and do', () => {
    it('shows an ordinary employee only their own leave', async () => {
      const res = await as(roles.eve).get('/leave/access');

      expect(res.body).toMatchObject({ canViewDashboard: false, canViewAll: false, canManageTypes: false, isSupervisor: false, isDepartmentHead: false });
      expect(res.body.employeeId).toEqual(expect.any(String));
    });

    it('shows the supervisor, the department head, HR and the director what they oversee', async () => {
      expect((await as(roles.sam).get('/leave/access')).body).toMatchObject({ isSupervisor: true, canViewDashboard: true, canViewAll: false });
      expect((await as(roles.head).get('/leave/access')).body).toMatchObject({ isDepartmentHead: true, canViewDashboard: true });
      expect((await hr().get('/leave/access')).body).toMatchObject({ canViewAll: true, canManageTypes: true });
      expect((await director().get('/leave/access')).body).toMatchObject({ canViewAll: true, canManageTypes: false });
    });

    it('needs an employee record to file', async () => {
      const res = await file(roles.nobody, monday, monday);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/no employee record/);
    });
  });

  describe('a request through all three steps', () => {
    let requestId: string;
    const start = monday;
    const end = plus(monday, 2); // Monday to Wednesday

    it('is filed with its working days and the day they are expected back', async () => {
      const res = await file(roles.eve, start, end, { reason: 'Family wedding' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'PENDING_SUPERVISOR', days: 3, reason: 'Family wedding', leaveType: { name: 'Annual leave' } });
      expect(res.body.returnDate.slice(0, 10)).toBe(iso(plus(monday, 3)));
      requestId = res.body.id;
    });

    it('waits for the supervisor, who finds it in their inbox', async () => {
      const inbox = await as(roles.sam).get('/leave/requests/inbox');
      const headInbox = await as(roles.head).get('/leave/requests/inbox');
      const hrInbox = await hr().get('/leave/requests/inbox');
      const mine = await as(roles.eve).get('/leave/requests/mine');

      expect(inbox.body.map((request: { id: string }) => request.id)).toContain(requestId);
      expect(headInbox.body.map((request: { id: string }) => request.id)).toContain(requestId);
      expect(hrInbox.body.map((request: { id: string }) => request.id)).not.toContain(requestId);
      expect(mine.body.map((request: { id: string }) => request.id)).toContain(requestId);
      expect((await as(roles.sam).get('/leave/access')).body.awaitingMyDecision).toBeGreaterThanOrEqual(1);
    });

    it('cannot be decided by the wrong person, or by the person who filed it', async () => {
      expect((await decide(roles.eve, requestId, 'APPROVE')).status).toBe(403);
      expect((await decide('hr', requestId, 'APPROVE')).status).toBe(403);
      expect((await decide('executive_director', requestId, 'APPROVE')).status).toBe(403);
      expect((await decide(roles.solo, requestId, 'APPROVE')).status).toBe(403);
      expect((await decide(roles.sam, requestId, 'MAYBE')).status).toBe(400);
    });

    it('goes to HR when the supervisor approves', async () => {
      const res = await decide(roles.sam, requestId, 'APPROVE', 'Fine by me');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING_HR');
      expect(res.body.approvals).toHaveLength(1);
      expect(res.body.approvals[0]).toMatchObject({ stage: 'SUPERVISOR', decision: 'APPROVED', comment: 'Fine by me' });
      expect((await decide(roles.sam, requestId, 'APPROVE')).status).toBe(403);
      expect((await hr().get('/leave/requests/inbox')).body.map((request: { id: string }) => request.id)).toContain(requestId);
    });

    it('goes to the executive director when HR approves', async () => {
      const res = await decide('hr', requestId, 'APPROVE');

      expect(res.body.status).toBe('PENDING_DIRECTOR');
      expect((await director().get('/leave/requests/inbox')).body.map((request: { id: string }) => request.id)).toContain(requestId);
      expect((await decide('hr', requestId, 'APPROVE')).status).toBe(403);
    });

    it('is approved once the executive director confirms it', async () => {
      const res = await decide('executive_director', requestId, 'APPROVE', 'Enjoy');

      expect(res.body.status).toBe('APPROVED');
      expect(res.body.approvals.map((a: { stage: string }) => a.stage)).toEqual(['SUPERVISOR', 'HR', 'DIRECTOR']);
      expect((await decide('executive_director', requestId, 'APPROVE')).status).toBe(400);
    });

    it('counts against the allowance', async () => {
      const res = await as(roles.eve).get('/leave/balance');

      const annual = res.body.balances.find((balance: { name: string }) => balance.name === 'Annual leave');
      expect(annual).toMatchObject({ entitlement: 21, used: 3, pending: 0, remaining: 18 });
    });

    it('shows on the who-is-on-leave dashboard, with the expected return date, to those who oversee them', async () => {
      const day = iso(plus(monday, 1));

      for (const viewer of [hr(), director(), as(roles.head), as(roles.sam), admin()]) {
        const res = await viewer.get(`/leave/on-leave?date=${day}`);
        expect(res.status).toBe(200);
        const entry = res.body.onLeave.find((request: { id: string }) => request.id === requestId);
        expect(entry).toBeDefined();
        expect(entry.returnDate.slice(0, 10)).toBe(iso(plus(monday, 3)));
        expect(entry.employee.user.department.name).toBe('Plant');
        expect(res.body.counts.onLeave).toBeGreaterThanOrEqual(1);
      }
    });

    it('is not on the dashboard before it starts, and appears as upcoming', async () => {
      const res = await hr().get(`/leave/on-leave?date=${iso(plus(monday, -7))}`);

      expect(res.body.onLeave.map((request: { id: string }) => request.id)).not.toContain(requestId);
      expect(res.body.upcoming.map((request: { id: string }) => request.id)).toContain(requestId);
    });

    it('can be narrowed to one department, and is hidden from other departments’ heads and from staff', async () => {
      const day = iso(plus(monday, 1));
      const other = await admin().post('/departments').send({ organizationId: orgId, code: `OT${run}`, name: 'Other' });

      const narrowed = await hr().get(`/leave/on-leave?date=${day}&departmentId=${other.body.id}`);
      expect(narrowed.body.onLeave.map((request: { id: string }) => request.id)).not.toContain(requestId);
      expect((await as(roles.eve).get('/leave/on-leave')).status).toBe(403);
      expect((await as(roles.solo).get(`/leave/on-leave?date=${day}`)).status).toBe(403);
      expect((await hr().get('/leave/on-leave?date=soon')).status).toBe(400);
    });

    it('can be read by the people involved and by those above them, but not by strangers', async () => {
      expect((await as(roles.eve).get(`/leave/requests/${requestId}`)).status).toBe(200);
      expect((await as(roles.head).get(`/leave/requests/${requestId}`)).status).toBe(200);
      expect((await hr().get(`/leave/requests/${requestId}`)).status).toBe(200);
      expect((await as(roles.solo).get(`/leave/requests/${requestId}`)).status).toBe(403);
      expect((await hr().get('/leave/requests/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    });

    it('is listed for HR and the head, with filters, and closed to staff', async () => {
      const all = await hr().get(`/leave/requests?status=APPROVED&from=${iso(start)}&to=${iso(end)}`);
      const head = await as(roles.head).get('/leave/requests');

      expect(all.body.map((request: { id: string }) => request.id)).toContain(requestId);
      expect(head.body.map((request: { id: string }) => request.id)).toContain(requestId);
      expect((await as(roles.eve).get('/leave/requests')).status).toBe(403);
      expect((await hr().get('/leave/requests?status=NOPE')).status).toBe(400);
    });

    it('lets the person who filed it cancel it before it starts, and not anyone else', async () => {
      expect((await as(roles.solo).post(`/leave/requests/${requestId}/cancel`)).status).toBe(403);
      const cancelled = await as(roles.eve).post(`/leave/requests/${requestId}/cancel`);

      expect(cancelled.body.status).toBe('CANCELLED');
      expect((await as(roles.eve).post(`/leave/requests/${requestId}/cancel`)).status).toBe(400);
      const balance = await as(roles.eve).get('/leave/balance');
      expect(balance.body.balances.find((entry: { name: string }) => entry.name === 'Annual leave').used).toBe(0);
    });
  });

  describe('declining', () => {
    it('ends the request, with the reason, at whichever step declines it', async () => {
      const filed = await file(roles.eve, plus(monday, 7), plus(monday, 8));

      expect((await decide(roles.sam, filed.body.id, 'REJECT')).status).toBe(400);
      const declined = await decide(roles.head, filed.body.id, 'REJECT', 'Shutdown that week');

      expect(declined.body.status).toBe('REJECTED');
      expect(declined.body.approvals[0]).toMatchObject({ stage: 'SUPERVISOR', decision: 'REJECTED', comment: 'Shutdown that week' });
      expect((await decide('hr', filed.body.id, 'APPROVE')).status).toBe(400);
      expect((await as(roles.eve).post(`/leave/requests/${filed.body.id}/cancel`)).status).toBe(400);
    });

    it('can be declined by HR or the director later on', async () => {
      const filed = await file(roles.eve, plus(monday, 14), plus(monday, 14));
      await decide(roles.sam, filed.body.id, 'APPROVE');

      const declined = await decide('hr', filed.body.id, 'REJECT', 'Short-staffed');
      expect(declined.body.status).toBe('REJECTED');
    });
  });

  describe('rules when filing', () => {
    it('refuses overlapping leave, dates with no working days, and bad dates', async () => {
      const first = await file(roles.eve, plus(monday, 21), plus(monday, 22));
      expect(first.status).toBe(201);

      expect((await file(roles.eve, plus(monday, 22), plus(monday, 24))).status).toBe(409);
      expect((await file(roles.eve, plus(monday, 26), plus(monday, 27))).status).toBe(400); // Saturday and Sunday
      expect((await file(roles.eve, plus(monday, 3), plus(monday, 1))).status).toBe(400);
      expect((await as(roles.eve).post('/leave/requests').send({ leaveTypeId: annualId, startDate: 'soon', endDate: 'later' })).status).toBe(400);
      expect((await as(roles.eve).post('/leave/requests').send({ leaveTypeId: '00000000-0000-0000-0000-000000000000', startDate: iso(monday), endDate: iso(monday) })).status).toBe(404);
    });

    it('refuses more than the yearly allowance, saying how much is left', async () => {
      const res = await file(roles.solo, plus(monday, 140), plus(monday, 180));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/only have \d+ of Annual leave left/);
    });

    it('does not let ordinary leave start in the past, but lets sick leave', async () => {
      // A recent working day, two to six days back.
      let past = plus(new Date(), -2);
      while (past.getUTCDay() === 0 || past.getUTCDay() === 6) past = plus(past, -1);

      const ordinary = await file(roles.solo, past, past);
      expect(ordinary.status).toBe(400);
      expect(ordinary.body.message).toMatch(/cannot start in the past/);

      const sick = await as(roles.solo).post('/leave/requests').send({ leaveTypeId: sickId, startDate: iso(past), endDate: iso(past) });
      expect(sick.status).toBe(201);
      expect(sick.body.leaveType.name).toBe('Sick leave');
    });

    it('skips the supervisor step for someone with nobody above them', async () => {
      const res = await file(roles.solo, plus(monday, 42), plus(monday, 42));

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING_HR');
    });
  });

  describe('balances', () => {
    it('can be read for a person by HR and by their head, but not by another employee', async () => {
      const eve = (await as(roles.eve).get('/leave/access')).body.employeeId;

      expect((await hr().get(`/leave/balance?employeeId=${eve}`)).status).toBe(200);
      expect((await as(roles.head).get(`/leave/balance?employeeId=${eve}`)).status).toBe(200);
      expect((await as(roles.solo).get(`/leave/balance?employeeId=${eve}`)).status).toBe(403);
      expect((await as(roles.eve).get('/leave/balance?year=26')).status).toBe(400);
      expect((await as(roles.nobody).get('/leave/balance')).status).toBe(404);
    });
  });
});
