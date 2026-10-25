import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

// The full asset record, editing, and who-holds-what, against the real database.
describe('Asset register and custody (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let maintenance: ReturnType<typeof asRole>;
  let staff: ReturnType<typeof asRole>;
  let holder: ReturnType<typeof asRole>;
  let holderId: string;
  let orgId: string;
  let otherOrgId: string;
  let deptId: string;
  let vendorId: string;
  let assetId: string;
  const run = Date.now();
  const tag = (n: number) => `AST-${run}-${n}`;

  const create = (n: number, extra: object = {}) =>
    maintenance.post('/assets').send({ organizationId: orgId, assetTag: tag(n), name: `Asset ${n}`, category: 'Rotating', ...extra });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    maintenance = asRole(app, 'maintenance');
    staff = asRole(app, 'staff');
    holder = asRole(app, 'hse');
    holderId = await provisionUser(app, prisma, 'hse');

    orgId = (await admin.post('/organizations').send({ name: `AssetCo ${run}` })).body.id;
    otherOrgId = (await admin.post('/organizations').send({ name: `OtherCo ${run}` })).body.id;
    deptId = (await admin.post('/departments').send({ organizationId: orgId, code: `AD${run}`, name: 'Plant' })).body.id;
    vendorId = (await admin.post('/vendors').send({ organizationId: orgId, name: `Supplier ${run}` })).body.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `.${run}@assets.test` } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('the full record', () => {
    it('stores serial number, make, model, purchase details, warranty, condition and owner', async () => {
      const res = await create(1, {
        serialNumber: `SN-${run}`,
        make: 'Grundfos',
        model: 'CR-45',
        purchaseDate: '2026-01-15',
        purchaseCost: 1500.5,
        vendorId,
        warrantyExpiry: '2028-01-15',
        condition: 'NEW',
        notes: 'Needs a guard',
        departmentId: deptId,
        location: 'Bay 3',
      });

      expect(res.status).toBe(201);
      assetId = res.body.id;
      expect(res.body).toMatchObject({
        serialNumber: `SN-${run}`,
        make: 'Grundfos',
        purchaseCost: '1500.5',
        condition: 'NEW',
        status: 'ACTIVE',
        currentAssignment: null,
        vendor: { name: `Supplier ${run}` },
        department: { name: 'Plant' },
      });
      expect(res.body.purchaseDate.slice(0, 10)).toBe('2026-01-15');
    });

    it('defaults the condition to GOOD and needs only the original fields', async () => {
      const res = await create(2);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ condition: 'GOOD', serialNumber: null, purchaseCost: null });
    });

    it('refuses a duplicate serial number but allows several assets with none', async () => {
      const clash = await create(3, { serialNumber: `SN-${run}` });
      expect(clash.status).toBe(409);
      expect(clash.body.message).toMatch(/Serial number .* is already used/);

      expect((await create(4)).status).toBe(201);
      expect((await create(5)).status).toBe(201);
      expect((await create(1)).body.message).toMatch(/Asset tag .* already exists/);
    });

    it.each([
      ['a bad date', { purchaseDate: '15/01/2026' }, /purchaseDate must be a date/],
      ['a warranty that ends before the purchase', { purchaseDate: '2026-06-01', warrantyExpiry: '2026-01-01' }, /warranty cannot expire before/],
      ['a negative cost', { purchaseCost: -5 }, /purchaseCost must be zero or more/],
      ['an unknown condition', { condition: 'WRECKED' }, /condition must be one of/],
    ])('refuses %s', async (_label, extra, message) => {
      const res = await create(50, extra);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
    });

    it('refuses a supplier from a different organization', async () => {
      const foreign = (await admin.post('/vendors').send({ organizationId: otherOrgId, name: `Foreign ${run}` })).body.id;

      const res = await create(51, { vendorId: foreign });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/different organization/);
    });

    it('is for admin and maintenance only', async () => {
      expect((await staff.post('/assets').send({ organizationId: orgId, assetTag: tag(60), name: 'x', category: 'x' })).status).toBe(403);
    });
  });

  describe('editing', () => {
    it('changes some fields, clears others, and leaves the rest', async () => {
      const res = await maintenance.patch(`/assets/${assetId}`).send({ name: 'Feed Pump A', condition: 'FAIR', notes: null, make: '' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Feed Pump A', condition: 'FAIR', notes: null, make: null, model: 'CR-45', serialNumber: `SN-${run}` });
    });

    it('validates what it is given', async () => {
      expect((await maintenance.patch(`/assets/${assetId}`).send({ name: ' ' })).status).toBe(400);
      expect((await maintenance.patch(`/assets/${assetId}`).send({ warrantyExpiry: '2025-01-01' })).body.message).toMatch(/warranty cannot expire before/);
      expect((await maintenance.patch(`/assets/${assetId}`).send({ assetTag: tag(2) })).status).toBe(409);
      expect((await maintenance.patch('/assets/00000000-0000-0000-0000-000000000000').send({ name: 'x' })).status).toBe(404);
    });

    it('is for admin and maintenance only', async () => {
      expect((await staff.patch(`/assets/${assetId}`).send({ name: 'x' })).status).toBe(403);
    });

    it('allows decommissioning and reinstating, but not UNDER_MAINTENANCE by hand', async () => {
      const spare = (await create(70)).body.id;

      expect((await maintenance.patch(`/assets/${spare}`).send({ status: 'UNDER_MAINTENANCE' })).status).toBe(400);
      expect((await maintenance.patch(`/assets/${spare}`).send({ status: 'DECOMMISSIONED' })).body.status).toBe('DECOMMISSIONED');
      expect((await maintenance.patch(`/assets/${spare}`).send({ status: 'ACTIVE' })).body.status).toBe('ACTIVE');
    });
  });

  describe('check-out and check-in', () => {
    it('needs a person or a department, and a real, active person', async () => {
      expect((await maintenance.post(`/assets/${assetId}/check-out`).send({})).body.message).toMatch(/Choose a person or a department/);
      expect((await maintenance.post(`/assets/${assetId}/check-out`).send({ assigneeId: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);

      const waiting = `waiting.${run}@assets.test`;
      await request(app.getHttpServer()).get('/auth/me').set('x-local-signup', waiting);
      const pending = await prisma.user.findUniqueOrThrow({ where: { email: waiting } });
      const res = await maintenance.post(`/assets/${assetId}/check-out`).send({ assigneeId: pending.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/does not have an active account/);
    });

    it('hands the asset to a person, who then sees it under "mine"', async () => {
      const res = await maintenance
        .post(`/assets/${assetId}/check-out`)
        .send({ assigneeId: holderId, expectedReturn: '2026-12-01', notes: 'For the shutdown' });

      expect(res.status).toBe(201);
      expect(res.body.currentAssignment).toMatchObject({
        assigneeId: holderId,
        conditionOut: 'FAIR',
        notes: 'For the shutdown',
        assignee: { email: 'hse@local.dev' },
      });
      expect(res.body.currentAssignment.expectedReturn.slice(0, 10)).toBe('2026-12-01');

      const mine = await holder.get('/assets/mine');
      expect(mine.body.map((a: { id: string }) => a.id)).toContain(assetId);
      expect((await staff.get('/assets/mine')).body.map((a: { id: string }) => a.id)).not.toContain(assetId);

      const byHolder = await admin.get('/assets').query({ assignedToId: holderId, organizationId: orgId });
      expect(byHolder.body.map((a: { id: string }) => a.id)).toEqual([assetId]);
    });

    it('will not hand out an asset that is already out, or decommission one that is', async () => {
      const second = await maintenance.post(`/assets/${assetId}/check-out`).send({ departmentId: deptId });
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/Already checked out to/);

      const decommission = await maintenance.patch(`/assets/${assetId}`).send({ status: 'DECOMMISSIONED' });
      expect(decommission.status).toBe(400);
      expect(decommission.body.message).toMatch(/Check the asset back in/);
    });

    it('will not hand out an asset that is decommissioned or under maintenance', async () => {
      const gone = (await create(80)).body.id;
      await maintenance.patch(`/assets/${gone}`).send({ status: 'DECOMMISSIONED' });
      expect((await maintenance.post(`/assets/${gone}/check-out`).send({ departmentId: deptId })).body.message).toMatch(/decommissioned and cannot be checked out/);

      const busy = (await create(81)).body.id;
      const order = await admin.post('/work-orders').send({ organizationId: orgId, assetId: busy, title: 'Service' });
      await admin.patch(`/work-orders/${order.body.id}/status`).send({ status: 'IN_PROGRESS' });
      expect((await maintenance.post(`/assets/${busy}/check-out`).send({ departmentId: deptId })).body.message).toMatch(
        /under maintenance and cannot be checked out/,
      );
    });

    it('takes it back, recording the condition it returned in as the asset\'s new condition', async () => {
      const res = await maintenance.post(`/assets/${assetId}/check-in`).send({ condition: 'POOR', notes: 'Cracked casing' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ condition: 'POOR', currentAssignment: null });
      expect((await maintenance.post(`/assets/${assetId}/check-in`).send({})).body.message).toMatch(/not checked out/);
      expect((await maintenance.post(`/assets/${assetId}/check-in`).send({ condition: 'WRECKED' })).status).toBe(400);
    });

    it('keeps the custody history, to a department as well', async () => {
      await maintenance.post(`/assets/${assetId}/check-out`).send({ departmentId: deptId });
      await maintenance.post(`/assets/${assetId}/check-in`).send({});

      const history = await staff.get(`/assets/${assetId}/assignments`);

      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(2);
      expect(history.body[0]).toMatchObject({ department: { name: 'Plant' }, assignee: null, returnedAt: expect.any(String) });
      expect(history.body[1]).toMatchObject({
        assignee: { email: 'hse@local.dev' },
        conditionOut: 'FAIR',
        conditionIn: 'POOR',
        returnNotes: 'Cracked casing',
        assignedBy: { email: 'maintenance@local.dev' },
        returnedBy: { email: 'maintenance@local.dev' },
      });
      expect((await staff.get('/assets/00000000-0000-0000-0000-000000000000/assignments')).status).toBe(404);
    });

    it('is for admin and maintenance only', async () => {
      expect((await staff.post(`/assets/${assetId}/check-out`).send({ departmentId: deptId })).status).toBe(403);
      expect((await staff.post(`/assets/${assetId}/check-in`).send({})).status).toBe(403);
    });
  });

  describe('the change history', () => {
    it('lists what was done to the asset, for admin and maintenance only', async () => {
      let rows: { action: string }[] = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        rows = (await maintenance.get(`/assets/${assetId}/history`)).body;
        if (rows.some((r) => r.action === 'ASSET_CHECKED_IN')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const actions = rows.map((r) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['ASSET_CREATE', 'ASSET_UPDATE', 'ASSET_CHECKED_OUT', 'ASSET_CHECKED_IN']));
      expect((await staff.get(`/assets/${assetId}/history`)).status).toBe(403);
      expect((await maintenance.get('/assets/00000000-0000-0000-0000-000000000000/history')).status).toBe(404);
    });
  });

  describe('finding assets', () => {
    it('filters by condition, status, department and a search across tag, name and serial', async () => {
      const byCondition = await admin.get('/assets').query({ organizationId: orgId, condition: 'POOR' });
      expect(byCondition.body.map((a: { id: string }) => a.id)).toEqual([assetId]);

      const byDepartment = await admin.get('/assets').query({ organizationId: orgId, departmentId: deptId });
      expect(byDepartment.body.map((a: { id: string }) => a.id)).toEqual([assetId]);

      const decommissioned = await admin.get('/assets').query({ organizationId: orgId, status: 'DECOMMISSIONED' });
      expect(decommissioned.body.length).toBeGreaterThan(0);

      for (const search of [`sn-${run}`, 'feed pump', tag(1).toLowerCase()]) {
        const found = await admin.get('/assets').query({ organizationId: orgId, search });
        expect(found.body.map((a: { id: string }) => a.id)).toEqual([assetId]);
      }
    });

    it('rejects an unknown filter value', async () => {
      expect((await admin.get('/assets').query({ status: 'LOST' })).status).toBe(400);
      expect((await admin.get('/assets').query({ condition: 'WRECKED' })).status).toBe(400);
    });
  });

  it('hides the purchase cost from the staff role only', async () => {
    expect((await admin.get(`/assets/${assetId}`)).body.purchaseCost).toBe('1500.5');
    const asStaff = await staff.get(`/assets/${assetId}`);

    expect(asStaff.status).toBe(200);
    expect(asStaff.body).not.toHaveProperty('purchaseCost');
    expect(asStaff.body.serialNumber).toBe(`SN-${run}`);
    expect((await staff.get('/assets').query({ organizationId: orgId })).body.every((a: object) => !('purchaseCost' in a))).toBe(true);
  });
});
