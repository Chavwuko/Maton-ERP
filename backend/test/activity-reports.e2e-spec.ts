import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// The activity log, the notification counts, the two dashboards and the
// reports with their CSV export, against the real database. The database is
// shared with other suites, so everything is found by names unique to this run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = Array<Record<string, any>>;

describe('Activity, notifications, dashboard and reports (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let keeper: ReturnType<typeof asRole>;
  let staff: ReturnType<typeof asRole>;
  let finance: ReturnType<typeof asRole>;
  let orgId: string;
  let whId: string;
  let vendorId: string;
  let deptId: string;
  let projectId: string;
  let itemId: string;
  const run = Date.now();
  const vendorName = `Apex Reports ${run}`;
  const deptName = `Dept ${run}`;

  // The log is written just after the response goes out, so give it a moment.
  async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
    let value = await read();
    for (let attempt = 0; attempt < 20 && !done(value); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      value = await read();
    }
    return value;
  }

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    keeper = asRole(app, 'inventory');
    staff = asRole(app, 'staff');
    finance = asRole(app, 'finance');

    orgId = (await admin.post('/organizations').send({ name: `ReportCo ${run}` })).body.id;
    whId = (await admin.post('/warehouses').send({ organizationId: orgId, code: `W${run}`, name: 'Main' })).body.id;
    vendorId = (await admin.post('/vendors').send({ organizationId: orgId, name: vendorName })).body.id;
    deptId = (await admin.post('/departments').send({ organizationId: orgId, code: `D${run}`, name: deptName })).body.id;
    projectId = (await admin.post('/projects').send({ organizationId: orgId, code: `P${run}`, name: 'Substation' })).body.id;
    itemId = (
      await keeper.post('/inventory-items').send({
        organizationId: orgId,
        sku: `RPT-${run}`,
        name: `Report item ${run}`,
        unitOfMeasure: 'pcs',
        unitCost: 2,
        reorderPoint: 100,
      })
    ).body.id;
    expect(
      (await keeper.post('/purchases').send({ warehouseId: whId, itemId, vendorId, quantity: 20, unitCost: 5, poNumber: `PO-${run}` })).status,
    ).toBe(201);
    expect(
      (await keeper.post('/consumptions').send({ warehouseId: whId, itemId, quantity: 4, departmentId: deptId, projectId })).status,
    ).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('activity log', () => {
    it('records changes with who made them and a readable summary', async () => {
      const log = await eventually<Rows>(
        async () => (await admin.get('/activity').query({ action: 'PURCHASE', limit: 500 })).body,
        (rows) => rows.some((r) => r.metadata.summary.includes(`PO-${run}`)),
      );

      const entry = log.find((r) => r.metadata.summary.includes(`PO-${run}`))!;
      expect(entry).toMatchObject({
        action: 'PURCHASE',
        entityType: 'Purchase',
        user: { email: 'inventory@local.dev' },
      });
      expect(entry.metadata.summary).toBe(`PO PO-${run}, quantity 20, total 100`);
      expect(entry.entityId).toBeTruthy();
    });

    it('records issues, filtered by record kind, action, user and date', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await eventually<Rows>(
        async () => (await admin.get('/activity').query({ entityType: 'Consumption', from: today, to: today, limit: 500 })).body,
        (found) => found.some((r) => r.action === 'ISSUE'),
      );

      // Other suites reverse issues too, so Consumption holds more than ISSUE.
      expect(rows.every((r) => r.entityType === 'Consumption')).toBe(true);
      const issue = rows.find((r) => r.action === 'ISSUE')!;
      const byAction = await admin.get('/activity').query({ action: 'ISSUE', limit: 500 });
      expect(byAction.body.length).toBeGreaterThan(0);
      expect(byAction.body.every((r: Rows[number]) => r.action === 'ISSUE')).toBe(true);
      const byUser = await admin.get('/activity').query({ userId: issue.user.id, action: 'ISSUE', limit: 500 });
      expect(byUser.body.every((r: Rows[number]) => r.user.id === issue.user.id)).toBe(true);
    });

    it('does not record reads or failed requests', async () => {
      await admin.get('/item-categories');
      const blank = await keeper.post('/item-categories').send({ organizationId: orgId, name: '  ' });
      expect(blank.status).toBe(400);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const all: Rows = (await admin.get('/activity').query({ limit: 500 })).body;
      // A request that failed or only read would have no record id behind it.
      expect(all.some((r) => r.action === 'CATEGORY_CREATE' && r.entityId === '')).toBe(false);
      expect(all.some((r) => r.metadata?.method === 'GET')).toBe(false);
    });

    it('logs changes with no label under their route', async () => {
      await admin.post('/organizations').send({ name: `Unlabelled ${run}` });

      const rows = await eventually<Rows>(
        async () => (await admin.get('/activity').query({ action: 'POST /organizations', limit: 500 })).body,
        (found) => found.length > 0,
      );

      expect(rows[0]).toMatchObject({ entityType: 'organizations' });
    });

    it('is admin only, and validates its filters', async () => {
      expect((await keeper.get('/activity')).status).toBe(403);
      expect((await staff.get('/activity')).status).toBe(403);
      expect((await admin.get('/activity').query({ limit: 9999 })).status).toBe(400);
      expect((await admin.get('/activity').query({ from: 'soon' })).status).toBe(400);
    });
  });

  describe('notifications', () => {
    it('shows the store what is waiting; only admin sees sign-up requests', async () => {
      const asAdmin = await admin.get('/notifications');
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.counts.total).toBe(asAdmin.body.counts.access + asAdmin.body.counts.appointments);
      expect(Array.isArray(asAdmin.body.access)).toBe(true);

      const asKeeper = await keeper.get('/notifications');
      expect(asKeeper.status).toBe(200);
      expect(asKeeper.body.access).toEqual([]);
      expect(asKeeper.body.counts.access).toBe(0);
    });

    it('is for the store only', async () => {
      expect((await staff.get('/notifications')).status).toBe(403);
      expect((await finance.get('/notifications')).status).toBe(403);
    });
  });

  describe('dashboard', () => {
    it('gives the store the store-wide picture, with this run\'s stock in it', async () => {
      const res = await keeper.get('/dashboard/inventory');

      expect(res.status).toBe(200);
      expect(res.body.kind).toBe('management');
      expect(res.body.kpi.items).toBeGreaterThan(0);
      expect(res.body.monthly.labels).toHaveLength(6);
      expect(res.body.actions.accessRequests).toBe(0);
      // reorderPoint is 100 and 16 are on hand, so this item is on the alert list.
      expect(res.body.alerts.some((a: { sku: string; status: string }) => a.sku === `RPT-${run}` && a.status === 'LOW_STOCK')).toBe(true);
      expect(res.body.recent.length).toBeGreaterThan(0);
      expect((await admin.get('/dashboard/inventory')).body.actions.accessRequests).toBeGreaterThanOrEqual(0);
    });

    it('gives everyone else a view of their own appointments', async () => {
      const res = await staff.get('/dashboard/inventory');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ kind: 'mine', counts: { pending: expect.any(Number) } });
      expect(res.body.upcoming).toEqual(expect.any(Array));
      expect(res.body).not.toHaveProperty('kpi');
      expect((await asRole(app, 'hse').get('/dashboard/inventory')).body.kind).toBe('mine');
    });

    it('also gives finance and viewer the store-wide picture', async () => {
      expect((await finance.get('/dashboard/inventory')).body.kind).toBe('management');
      expect((await asRole(app, 'viewer').get('/dashboard/inventory')).body.kind).toBe('management');
    });
  });

  describe('reports', () => {
    const today = new Date().toISOString().slice(0, 10);

    it('totals spend by supplier and usage by project, department and item', async () => {
      const res = await finance.get('/reports/inventory').query({ from: today, to: today });

      expect(res.status).toBe(200);
      expect(res.body.bySupplier.find((s: { name: string }) => s.name === vendorName)).toMatchObject({ total: 100, count: 1 });
      expect(res.body.byProject.find((p: { name: string }) => p.name === `P${run} — Substation`)).toMatchObject({ total: 20, count: 1 });
      expect(res.body.byDepartment.find((d: { name: string }) => d.name === deptName)).toMatchObject({ total: 20, count: 1 });
      expect(res.body.byItem.find((i: { sku: string }) => i.sku === `RPT-${run}`)).toMatchObject({ quantity: 4 });
      expect(res.body.totals.purchases).toBeGreaterThanOrEqual(100);
      expect(res.body.valuation.length).toBeGreaterThan(0);
    });

    it('leaves out a range this activity is not in', async () => {
      const res = await admin.get('/reports/inventory').query({ from: '2000-01-01', to: '2000-01-31' });

      expect(res.body.totals).toMatchObject({ purchases: 0, consumption: 0, purchaseLines: 0, issueLines: 0 });
      expect(res.body.bySupplier).toEqual([]);
    });

    it('is for the roles that see costs', async () => {
      expect((await keeper.get('/reports/inventory')).status).toBe(200);
      expect((await asRole(app, 'viewer').get('/reports/inventory')).status).toBe(200);
      expect((await staff.get('/reports/inventory')).status).toBe(403);
      expect((await asRole(app, 'hse').get('/reports/inventory/csv').query({ type: 'stock' })).status).toBe(403);
    });

    it('rejects a malformed date', async () => {
      expect((await admin.get('/reports/inventory').query({ from: 'soon' })).status).toBe(400);
    });

    it('exports a CSV file for download', async () => {
      const res = await finance.get('/reports/inventory/csv').query({ type: 'suppliers', from: today, to: today });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toBe(`attachment; filename="suppliers-${today}_to_${today}.csv"`);
      expect(res.text.startsWith('﻿Supplier,Purchases,Total spend')).toBe(true);
      expect(res.text).toContain(`${vendorName},1,100`);
    });

    it.each([
      ['stock', 'SKU,Name,Category,Unit,Location,On hand,Reorder point,Unit cost,Value,Status'],
      ['purchases', 'Date,PO,SKU,Item,Supplier,Quantity,Unit cost,Total'],
      ['consumption', 'Date,SKU,Item,Quantity,Department,Project,Issued to,Purpose,Cost'],
      ['projects', 'Project,Issues,Total cost'],
      ['departments', 'Department,Issues,Total cost'],
      ['items', 'SKU,Item,Unit,Quantity issued,Cost'],
      ['valuation', 'Category,Items,Value'],
    ])('exports %s', async (type, header) => {
      const res = await admin.get('/reports/inventory/csv').query({ type });

      expect(res.status).toBe(200);
      expect(res.text.replace('﻿', '').split('\r\n')[0]).toBe(header);
    });

    it('rejects an unknown export type', async () => {
      const res = await admin.get('/reports/inventory/csv').query({ type: 'secrets' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/type must be one of/);
    });
  });
});
