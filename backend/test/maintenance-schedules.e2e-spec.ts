import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Preventive maintenance schedules, the work orders they open, and the service
// history they build up, against the real database.
describe('Maintenance schedules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let maintenance: ReturnType<typeof asRole>;
  let staff: ReturnType<typeof asRole>;
  let orgId: string;
  let assetId: string;
  const run = Date.now();

  const schedule = (extra: object = {}) =>
    maintenance.post('/maintenance-schedules').send({
      assetId,
      title: `Grease bearings ${run}`,
      intervalValue: 30,
      intervalUnit: 'DAYS',
      firstDueDate: inDays(3),
      ...extra,
    });
  const workOrdersOf = async (scheduleId: string) =>
    (await admin.get(`/work-orders?assetId=${assetId}`)).body.filter((wo: { scheduleId: string }) => wo.scheduleId === scheduleId);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    maintenance = asRole(app, 'maintenance');
    staff = asRole(app, 'staff');

    orgId = (await admin.post('/organizations').send({ name: `SchedCo ${run}` })).body.id;
    assetId = (await admin.post('/assets').send({ organizationId: orgId, assetTag: `SCH-${run}`, name: 'Pump', category: 'Rotating' })).body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('who can do what', () => {
    it('lets any signed-in user read but only admin or maintenance plan', async () => {
      expect((await staff.get('/maintenance-schedules')).status).toBe(200);
      expect((await staff.post('/maintenance-schedules').send({})).status).toBe(403);
      expect((await staff.post('/maintenance-schedules/generate')).status).toBe(403);
      expect((await staff.patch('/maintenance-schedules/x').send({})).status).toBe(403);
    });

    it('keeps deleting for admin only', async () => {
      const created = await schedule({ firstDueDate: inDays(200) });

      expect((await maintenance.delete(`/maintenance-schedules/${created.body.id}`)).status).toBe(403);
      expect((await admin.delete(`/maintenance-schedules/${created.body.id}`)).status).toBe(200);
      expect((await admin.get(`/maintenance-schedules/${created.body.id}`)).status).toBe(404);
    });
  });

  describe('creating', () => {
    it('rejects what cannot be scheduled', async () => {
      expect((await schedule({ intervalUnit: 'FORTNIGHTS' })).status).toBe(400);
      expect((await schedule({ intervalValue: 0 })).status).toBe(400);
      expect((await schedule({ firstDueDate: undefined })).status).toBe(400);
      expect((await schedule({ firstDueDate: '2026-02-30' })).status).toBe(400);
      expect((await schedule({ title: '  ' })).status).toBe(400);
      expect((await schedule({ assetId: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
    });

    it('refuses a decommissioned asset', async () => {
      const gone = await admin.post('/assets').send({ organizationId: orgId, assetTag: `GONE-${run}`, name: 'Old', category: 'x' });
      await admin.patch(`/assets/${gone.body.id}`).send({ status: 'DECOMMISSIONED' });

      const res = await schedule({ assetId: gone.body.id });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/decommissioned/);
    });

    it('does not open a work order for one that is a long way off', async () => {
      const res = await schedule({ title: `Far off ${run}`, firstDueDate: inDays(200) });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ dueStatus: 'UPCOMING', active: true, basis: 'FIXED', leadDays: 7, asset: { assetTag: `SCH-${run}` } });
      expect(await workOrdersOf(res.body.id)).toHaveLength(0);
    });

    it('lists and filters schedules', async () => {
      const far = (await schedule({ title: `Listed ${run}`, firstDueDate: inDays(250) })).body;

      const upcoming = await staff.get(`/maintenance-schedules?assetId=${assetId}&dueStatus=UPCOMING`);
      const overdue = await staff.get(`/maintenance-schedules?assetId=${assetId}&dueStatus=OVERDUE`);
      const bad = await staff.get('/maintenance-schedules?dueStatus=SOMETIME');

      expect(upcoming.body.map((s: { id: string }) => s.id)).toContain(far.id);
      expect(overdue.body.map((s: { id: string }) => s.id)).not.toContain(far.id);
      expect(bad.status).toBe(400);
    });
  });

  describe('the work order a schedule opens', () => {
    let scheduleId: string;
    let dueDate: string;
    let workOrderId: string;

    it('opens a preventive work order as soon as the schedule is inside its lead time', async () => {
      dueDate = inDays(3);
      const res = await schedule({ title: `Due soon ${run}`, firstDueDate: dueDate, priority: 'HIGH', description: 'Use the red grease' });
      scheduleId = res.body.id;

      expect(res.status).toBe(201);
      expect(res.body.dueStatus).toBe('DUE_SOON');
      const [workOrder] = await workOrdersOf(scheduleId);
      expect(workOrder).toMatchObject({ type: 'PREVENTIVE', priority: 'HIGH', status: 'OPEN', title: `Due soon ${run}`, description: 'Use the red grease' });
      expect(workOrder.dueDate.slice(0, 10)).toBe(dueDate);
      workOrderId = workOrder.id;
    });

    it('does not open a second one while the first is still open', async () => {
      const generated = await maintenance.post('/maintenance-schedules/generate');
      await maintenance.patch(`/maintenance-schedules/${scheduleId}`).send({ title: `Due soon ${run}` });

      expect(generated.status).toBe(201);
      expect(generated.body.workOrders.map((wo: { id: string }) => wo.id)).not.toContain(workOrderId);
      expect(await workOrdersOf(scheduleId)).toHaveLength(1);
    });

    it('takes notes and a cost only when completing', async () => {
      await maintenance.patch(`/work-orders/${workOrderId}/status`).send({ status: 'IN_PROGRESS' });

      const early = await maintenance.patch(`/work-orders/${workOrderId}/status`).send({ status: 'ON_HOLD', completionNotes: 'x' });
      const negative = await maintenance.patch(`/work-orders/${workOrderId}/status`).send({ status: 'COMPLETED', cost: -5 });

      expect(early.status).toBe(400);
      expect(negative.status).toBe(400);
    });

    it('moves the schedule on when the work order is completed, and records what was done', async () => {
      const done = await maintenance
        .patch(`/work-orders/${workOrderId}/status`)
        .send({ status: 'COMPLETED', completionNotes: 'Replaced the seal', cost: 125.5 });

      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ status: 'COMPLETED', completionNotes: 'Replaced the seal', cost: '125.5' });

      const after = (await staff.get(`/maintenance-schedules/${scheduleId}`)).body;
      expect(after.nextDueDate.slice(0, 10)).toBe(plusDays(dueDate, 30));
      expect(after.lastCompletedDate.slice(0, 10)).toBe(inDays(0));
      expect(after.dueStatus).toBe('UPCOMING');
    });

    it('shows the completed work, cost and totals in the asset’s service history', async () => {
      const res = await staff.get(`/assets/${assetId}/service-history`);

      expect(res.status).toBe(200);
      const entry = res.body.workOrders.find((wo: { id: string }) => wo.id === workOrderId);
      expect(entry).toMatchObject({ type: 'PREVENTIVE', completionNotes: 'Replaced the seal', cost: '125.5' });
      expect(res.body.totals.count).toBeGreaterThanOrEqual(1);
      expect(res.body.totals.preventive).toBeGreaterThanOrEqual(1);
      expect(Number(res.body.totals.cost)).toBeGreaterThanOrEqual(125.5);
      expect(res.body.totals.lastServiceAt).toEqual(expect.any(String));
    });

    it('404s the service history of an unknown asset', async () => {
      expect((await staff.get('/assets/00000000-0000-0000-0000-000000000000/service-history')).status).toBe(404);
    });
  });

  describe('cancelling, pausing and deleting', () => {
    it('skips an occurrence when its work order is cancelled, without counting it as done', async () => {
      const dueDate = inDays(2);
      const created = (await schedule({ title: `Cancel me ${run}`, firstDueDate: dueDate })).body;
      const [workOrder] = await workOrdersOf(created.id);

      const res = await maintenance.patch(`/work-orders/${workOrder.id}/status`).send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      const after = (await staff.get(`/maintenance-schedules/${created.id}`)).body;
      expect(after.nextDueDate.slice(0, 10)).toBe(plusDays(dueDate, 30));
      expect(after.lastCompletedDate).toBeNull();
    });

    it('a paused schedule opens nothing, and resuming brings it back', async () => {
      const created = (await schedule({ title: `Pause me ${run}`, firstDueDate: inDays(200) })).body;

      const paused = await maintenance.patch(`/maintenance-schedules/${created.id}`).send({ active: false, nextDueDate: inDays(1) });
      await maintenance.post('/maintenance-schedules/generate');

      expect(paused.body.dueStatus).toBe('PAUSED');
      expect(await workOrdersOf(created.id)).toHaveLength(0);

      const resumed = await maintenance.patch(`/maintenance-schedules/${created.id}`).send({ active: true });
      expect(resumed.body.dueStatus).toBe('DUE_SOON');
      expect(await workOrdersOf(created.id)).toHaveLength(1);
    });

    it('rejects a bad edit', async () => {
      const created = (await schedule({ firstDueDate: inDays(200) })).body;

      expect((await maintenance.patch(`/maintenance-schedules/${created.id}`).send({ active: 'yes' })).status).toBe(400);
      expect((await maintenance.patch(`/maintenance-schedules/${created.id}`).send({ nextDueDate: 'soon' })).status).toBe(400);
      expect((await maintenance.patch('/maintenance-schedules/00000000-0000-0000-0000-000000000000').send({})).status).toBe(404);
    });

    it('deleting a schedule keeps the work orders it opened', async () => {
      const created = (await schedule({ title: `Delete me ${run}`, firstDueDate: inDays(1) })).body;
      const [workOrder] = await workOrdersOf(created.id);

      expect((await admin.delete(`/maintenance-schedules/${created.id}`)).status).toBe(200);

      const kept = await admin.get(`/work-orders/${workOrder.id}`);
      expect(kept.status).toBe(200);
      expect(kept.body.scheduleId).toBeNull();
    });
  });
});
