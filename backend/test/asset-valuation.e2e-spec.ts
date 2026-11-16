import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Depreciation settings and book values, against the real database.
describe('Asset depreciation and valuation (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let maintenance: ReturnType<typeof asRole>;
  let finance: ReturnType<typeof asRole>;
  let staff: ReturnType<typeof asRole>;
  let orgId: string;
  const run = Date.now();
  const tag = (n: number) => `DEP-${run}-${n}`;

  const create = (n: number, extra: object = {}) =>
    maintenance.post('/assets').send({ organizationId: orgId, assetTag: tag(n), name: `Asset ${n}`, category: 'Rotating', ...extra });
  const depreciated = { purchaseCost: 12000, purchaseDate: '2026-01-15', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 60, salvageValue: 2000 };

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    maintenance = asRole(app, 'maintenance');
    finance = asRole(app, 'finance');
    staff = asRole(app, 'staff');
    orgId = (await admin.post('/organizations').send({ name: `DepCo ${run}` })).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('settings', () => {
    it('stores the method, life, salvage value and start date', async () => {
      const res = await create(1, { ...depreciated, depreciationStartDate: '2026-02-01' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 60, salvageValue: '2000' });
      expect(res.body.depreciationStartDate.slice(0, 10)).toBe('2026-02-01');
    });

    it('defaults to no depreciation', async () => {
      const res = await create(2);

      expect(res.body).toMatchObject({ depreciationMethod: 'NONE', usefulLifeMonths: null, salvageValue: null });
    });

    it('refuses settings that cannot be worked with', async () => {
      const bad = [
        { depreciationMethod: 'MAGIC' },
        { usefulLifeMonths: 0 },
        { usefulLifeMonths: 601 },
        { salvageValue: -1 },
        { salvageValue: 13000 },
        { purchaseCost: undefined },
        { usefulLifeMonths: undefined },
        { purchaseDate: undefined },
      ];
      for (const [i, change] of bad.entries()) {
        const res = await create(10 + i, { ...depreciated, ...change });
        expect([i, res.status]).toEqual([i, 400]);
      }
    });

    it('checks an edit against the asset as it will be', async () => {
      const id = (await create(3, depreciated)).body.id;

      expect((await maintenance.patch(`/assets/${id}`).send({ purchaseCost: null })).status).toBe(400);
      expect((await maintenance.patch(`/assets/${id}`).send({ usefulLifeMonths: null })).status).toBe(400);
      expect((await maintenance.patch(`/assets/${id}`).send({ salvageValue: 99999 })).status).toBe(400);

      const switched = await maintenance.patch(`/assets/${id}`).send({ depreciationMethod: 'DECLINING_BALANCE' });
      expect(switched.status).toBe(200);
      expect(switched.body.depreciationMethod).toBe('DECLINING_BALANCE');

      const off = await maintenance.patch(`/assets/${id}`).send({ depreciationMethod: 'NONE', purchaseCost: null });
      expect(off.status).toBe(200);
    });
  });

  describe('book value', () => {
    let id: string;

    beforeAll(async () => {
      id = (await create(20, depreciated)).body.id;
    });

    it('works out cost, accumulated depreciation and book value on a day, with a yearly schedule', async () => {
      const res = await finance.get(`/assets/${id}/valuation?asOf=2027-01-15`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        asOf: '2027-01-15',
        method: 'STRAIGHT_LINE',
        cost: '12000',
        accumulatedDepreciation: '2000',
        bookValue: '10000',
        monthsElapsed: 12,
        fullyDepreciated: false,
      });
      expect(res.body.schedule).toHaveLength(5);
      expect(res.body.schedule[0]).toMatchObject({ year: 1, opening: '12000', depreciation: '2000', closing: '10000' });
      expect(res.body.schedule[4].closing).toBe('2000');
    });

    it('stops at the salvage value once the life is over, and is the cost before a month has passed', async () => {
      const over = await finance.get(`/assets/${id}/valuation?asOf=2040-01-01`);
      const before = await finance.get(`/assets/${id}/valuation?asOf=2026-02-01`);

      expect(over.body).toMatchObject({ bookValue: '2000', fullyDepreciated: true });
      expect(before.body).toMatchObject({ bookValue: '12000', accumulatedDepreciation: '0', monthsElapsed: 0 });
    });

    it('declining balance writes off more early on', async () => {
      await maintenance.patch(`/assets/${id}`).send({ depreciationMethod: 'DECLINING_BALANCE' });

      const res = await finance.get(`/assets/${id}/valuation?asOf=2027-01-15`);

      expect(Number(res.body.bookValue)).toBeLessThan(10000);
      expect(Number((await finance.get(`/assets/${id}/valuation?asOf=2040-01-01`)).body.bookValue)).toBe(2000);
    });

    it('uses today when no day is given, and rejects a bad one', async () => {
      expect((await finance.get(`/assets/${id}/valuation`)).body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((await finance.get(`/assets/${id}/valuation?asOf=tomorrow`)).status).toBe(400);
      expect((await finance.get('/assets/00000000-0000-0000-0000-000000000000/valuation')).status).toBe(404);
    });

    it('is closed to the staff role, who never see money', async () => {
      expect((await staff.get(`/assets/${id}/valuation`)).status).toBe(403);
      expect((await staff.get('/assets/valuation')).status).toBe(403);
      const asset = await staff.get(`/assets/${id}`);
      expect(asset.status).toBe(200);
      expect(asset.body).not.toHaveProperty('purchaseCost');
      expect(asset.body).not.toHaveProperty('salvageValue');
    });
  });

  describe('the register', () => {
    let freshOrg: string;

    beforeAll(async () => {
      freshOrg = (await admin.post('/organizations').send({ name: `ValueCo ${run}` })).body.id;
      const make = (n: number, extra: object) =>
        maintenance.post('/assets').send({ organizationId: freshOrg, assetTag: `V-${run}-${n}`, name: `V${n}`, category: 'Rotating', ...extra });
      await make(1, depreciated);
      await make(2, { category: 'Vehicles', purchaseCost: 500 });
      await make(3, { category: 'Vehicles' });
      const gone = await make(4, { purchaseCost: 100 });
      await maintenance.patch(`/assets/${gone.body.id}`).send({ status: 'DECOMMISSIONED' });
    });

    it('values every live asset and totals them, overall and by category', async () => {
      const res = await finance.get(`/assets/valuation?organizationId=${freshOrg}&asOf=2027-01-15`);

      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(3);
      expect(res.body.totals).toMatchObject({ count: 2, cost: '12500', accumulatedDepreciation: '2000', bookValue: '10500', notValued: 1 });
      expect(res.body.totals.byCategory).toEqual([
        expect.objectContaining({ category: 'Rotating', count: 1, bookValue: '10000' }),
        expect.objectContaining({ category: 'Vehicles', count: 1, bookValue: '500' }),
      ]);
    });

    it('can include decommissioned assets', async () => {
      const res = await finance.get(`/assets/valuation?organizationId=${freshOrg}&asOf=2027-01-15&includeDecommissioned=true`);

      expect(res.body.rows).toHaveLength(4);
      expect(res.body.totals.count).toBe(3);
    });

    it('rejects a bad day', async () => {
      expect((await finance.get('/assets/valuation?asOf=tomorrow')).status).toBe(400);
    });
  });
});
