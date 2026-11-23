import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// The asset dashboard, spreadsheets and attachments, against the real database.
describe('Asset dashboard, exports and attachments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let maintenance: ReturnType<typeof asRole>;
  let finance: ReturnType<typeof asRole>;
  let staff: ReturnType<typeof asRole>;
  let orgId: string;
  let holderId: string;
  let pumpId: string;
  const run = Date.now();

  const make = (n: number, extra: object = {}) =>
    maintenance.post('/assets').send({ organizationId: orgId, assetTag: `DB-${run}-${n}`, name: `Asset ${n}`, category: 'Rotating', ...extra });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    maintenance = asRole(app, 'maintenance');
    finance = asRole(app, 'finance');
    staff = asRole(app, 'staff');
    holderId = await provisionUser(app, prisma, 'hse');
    orgId = (await admin.post('/organizations').send({ name: `DashCo ${run}` })).body.id;

    // Pump: costs 12000, depreciated, warranty ends soon, held and overdue back.
    pumpId = (
      await make(1, {
        purchaseCost: 12000, purchaseDate: '2026-01-15', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 60, salvageValue: 2000,
        warrantyExpiry: inDays(20), condition: 'FAIR',
      })
    ).body.id;
    await maintenance.post(`/assets/${pumpId}/check-out`).send({ assigneeId: holderId, expectedReturn: inDays(-3) });
    // Fan: no cost, with a schedule that is overdue and one open work order.
    const fanId = (await make(2)).body.id;
    await maintenance.post('/maintenance-schedules').send({ assetId: fanId, title: 'Grease', intervalValue: 1, intervalUnit: 'MONTHS', firstDueDate: inDays(-5) });
    // Press: decommissioned.
    const pressId = (await make(3, { purchaseCost: 500 })).body.id;
    await maintenance.patch(`/assets/${pressId}`).send({ status: 'DECOMMISSIONED' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `.${run}@assets.test` } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('dashboard', () => {
    it('counts the register and lists what needs attention', async () => {
      const res = await finance.get(`/assets/dashboard?organizationId=${orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.assetCount).toBe(3);
      expect(res.body.byStatus).toEqual(expect.arrayContaining([{ label: 'ACTIVE', count: 2 }, { label: 'DECOMMISSIONED', count: 1 }]));
      expect(res.body.checkedOut).toBe(1);
      expect(res.body.overdueReturns.count).toBe(1);
      expect(res.body.overdueReturns.items[0].asset.assetTag).toBe(`DB-${run}-1`);
      expect(res.body.warrantyExpiring.count).toBe(1);
      expect(res.body.warrantyExpiring.items[0].assetTag).toBe(`DB-${run}-1`);
      expect(res.body.maintenance).toMatchObject({ openWorkOrders: 1 });
      expect(res.body.totals.notValued).toBe(1);
      expect(Number(res.body.totals.bookValue)).toBeGreaterThan(0);
    });

    it('is open to the staff role, without the money', async () => {
      const res = await staff.get(`/assets/dashboard?organizationId=${orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.assetCount).toBe(3);
      expect(res.body.totals).toEqual({ notValued: 1 });
    });
  });

  describe('spreadsheets', () => {
    it('exports the register as a download', async () => {
      const res = await finance.get(`/assets/export?organizationId=${orgId}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="assets-\d{4}-\d{2}-\d{2}\.csv"/);
      const lines = res.text.replace(/^﻿/, '').trimEnd().split('\r\n');
      expect(lines[0]).toContain('Book value');
      expect(lines).toHaveLength(4);
      expect(lines.join('\n')).toContain(`DB-${run}-1`);
    });

    it('filters the export like the list, and rejects a bad filter', async () => {
      const res = await finance.get(`/assets/export?organizationId=${orgId}&status=DECOMMISSIONED`);

      expect(res.text.replace(/^﻿/, '').trimEnd().split('\r\n')).toHaveLength(2);
      expect((await finance.get('/assets/export?status=NOPE')).status).toBe(400);
    });

    it('leaves the money columns out for the staff role', async () => {
      const res = await staff.get(`/assets/export?organizationId=${orgId}`);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('Purchase cost');
      expect(res.text).not.toContain('12000');
    });

    it('exports the valuation, closed to the staff role', async () => {
      const res = await finance.get(`/assets/valuation/export?organizationId=${orgId}&asOf=2027-01-15`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('asset-valuation-2027-01-15.csv');
      expect(res.text).toContain(`DB-${run}-1`);
      expect(res.text).toContain(',Total,');
      expect((await staff.get('/assets/valuation/export')).status).toBe(403);
    });
  });

  describe('photos and documents', () => {
    let documentId: string;

    it('attaches a file to an asset', async () => {
      const res = await maintenance
        .post('/documents')
        .field('organizationId', orgId)
        .field('assetId', pumpId)
        .field('title', 'Nameplate photo')
        .attach('file', Buffer.from('not really a jpeg'), { filename: 'plate.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body.assetId).toBe(pumpId);
      documentId = res.body.id;
    });

    it('lists an asset’s documents and hands out a download link', async () => {
      const list = await staff.get(`/documents?assetId=${pumpId}`);
      const other = await staff.get('/documents?assetId=00000000-0000-0000-0000-000000000000');

      expect(list.body.map((doc: { id: string }) => doc.id)).toEqual([documentId]);
      expect(other.body).toEqual([]);
      const link = await staff.get(`/documents/${documentId}/versions/${list.body[0].versions[0].id}/download`);
      expect(link.status).toBe(200);
      expect(link.body.fileName).toBe('plate.jpg');
    });

    it('refuses an unknown asset', async () => {
      const res = await maintenance
        .post('/documents')
        .field('organizationId', orgId)
        .field('assetId', '00000000-0000-0000-0000-000000000000')
        .field('title', 'Lost')
        .attach('file', Buffer.from('x'), 'x.txt');

      expect(res.status).toBe(404);
    });
  });
});
