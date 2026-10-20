import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Covers what the old Google Apps Script store did beyond plain stock
// counts: costed purchases, issues charged to a department/project, stock
// takes, and reversals — all through the one ledger.
describe('Inventory stock engine (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let keeper: ReturnType<typeof asRole>;
  let orgId: string;
  let whId: string;
  let vendorId: string;
  let deptId: string;
  let projectId: string;
  let categoryId: string;
  let itemId: string;
  let purchaseId: string;
  let consumptionId: string;

  const item = async () => (await admin.get(`/inventory-items/${itemId}`)).body;
  const onHand = async () =>
    (await item()).stockLevels.reduce((s: number, l: { quantityOnHand: number }) => s + l.quantityOnHand, 0);

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    keeper = asRole(app, 'inventory');
    orgId = (await admin.post('/organizations').send({ name: 'StockCo' })).body.id;
    whId = (await admin.post('/warehouses').send({ organizationId: orgId, code: 'MAIN', name: 'Main store' })).body.id;
    vendorId = (await admin.post('/vendors').send({ organizationId: orgId, name: 'Apex Supplies' })).body.id;
    deptId = (await admin.post('/departments').send({ organizationId: orgId, code: 'OPS', name: 'Operations' })).body.id;
    projectId = (await admin.post('/projects').send({ organizationId: orgId, code: 'PRJ-1', name: 'Substation' })).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('categories and items', () => {
    it('creates a category (inventory role) and rejects a duplicate or a blank name', async () => {
      const ok = await keeper.post('/item-categories').send({ organizationId: orgId, name: 'Electrical' });
      expect(ok.status).toBe(201);
      categoryId = ok.body.id;

      expect((await keeper.post('/item-categories').send({ organizationId: orgId, name: 'Electrical' })).status).toBe(409);
      expect((await keeper.post('/item-categories').send({ organizationId: orgId, name: '  ' })).status).toBe(400);

      const list = await admin.get(`/item-categories?organizationId=${orgId}`);
      expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Electrical']);
    });

    it('only admin/inventory can create categories', async () => {
      const res = await asRole(app, 'finance').post('/item-categories').send({ organizationId: orgId, name: 'X' });
      expect(res.status).toBe(403);
    });

    it('creates an item with a decimal opening balance, which lands in the ledger', async () => {
      const res = await keeper.post('/inventory-items').send({
        organizationId: orgId,
        sku: 'HX-CABLE',
        name: 'Armoured Cable 4C x 16mm',
        unitOfMeasure: 'm',
        categoryId,
        location: 'Rack A1',
        unitCost: 4.5,
        reorderPoint: 200,
        openingStock: 800.5,
        openingWarehouseId: whId,
      });
      expect(res.status).toBe(201);
      itemId = res.body.id;
      expect(res.body.location).toBe('Rack A1');
      expect(Number(res.body.unitCost)).toBe(4.5);

      expect(await onHand()).toBe(800.5);
      const ledger = await admin.get(`/stock-transactions?itemId=${itemId}&type=OPENING`);
      expect(ledger.body).toHaveLength(1);
      expect(ledger.body[0]).toMatchObject({ type: 'OPENING', quantity: 800.5, balanceAfter: 800.5 });
    });

    it('an opening balance needs a warehouse', async () => {
      const res = await keeper
        .post('/inventory-items')
        .send({ organizationId: orgId, sku: 'HX-X', name: 'X', unitOfMeasure: 'pcs', openingStock: 5 });
      expect(res.status).toBe(400);
    });

    it('edits an item but never its cost directly', async () => {
      const res = await keeper.patch(`/inventory-items/${itemId}`).send({ location: 'Rack B2', unitCost: 999 });
      expect(res.status).toBe(200);
      expect(res.body.location).toBe('Rack B2');
      expect(Number(res.body.unitCost)).toBe(4.5);
    });
  });

  describe('purchases', () => {
    it('is restricted to admin/inventory', async () => {
      const res = await asRole(app, 'finance')
        .post('/purchases')
        .send({ warehouseId: whId, itemId, vendorId, quantity: 1, unitCost: 1 });
      expect(res.status).toBe(403);
    });

    it('raises stock and recalculates the weighted-average cost', async () => {
      // 800.5 on hand at 4.50, buying 199.5 at 6.00 => (800.5*4.5 + 199.5*6) / 1000 = 4.80 (to 2dp)
      const res = await keeper.post('/purchases').send({
        warehouseId: whId,
        itemId,
        vendorId,
        quantity: 199.5,
        unitCost: 6,
        poNumber: 'PO-1001',
        date: '2026-06-10',
      });
      expect(res.status).toBe(201);
      purchaseId = res.body.id;
      expect(Number(res.body.total)).toBe(1197);

      expect(await onHand()).toBe(1000);
      expect(Number((await item()).unitCost)).toBe(4.8);
    });

    it('writes a ledger row pointing at the purchase, with the running balance', async () => {
      const ledger = await admin.get(`/stock-transactions?itemId=${itemId}&type=RECEIPT`);
      expect(ledger.body[0]).toMatchObject({ refType: 'PURCHASE', refId: purchaseId, balanceAfter: 1000, notes: 'PO PO-1001' });
    });

    it('lists purchases with supplier and item, filterable by date', async () => {
      const all = await admin.get(`/purchases?organizationId=${orgId}`);
      expect(all.body).toHaveLength(1);
      expect(all.body[0].vendor.name).toBe('Apex Supplies');

      const outside = await admin.get(`/purchases?organizationId=${orgId}&from=2026-07-01`);
      expect(outside.body).toHaveLength(0);
    });

    it('rejects bad input', async () => {
      const base = { warehouseId: whId, itemId, vendorId };
      expect((await keeper.post('/purchases').send({ ...base, quantity: 0, unitCost: 1 })).status).toBe(400);
      expect((await keeper.post('/purchases').send({ ...base, quantity: 1, unitCost: -1 })).status).toBe(400);
      expect((await keeper.post('/purchases').send({ ...base, vendorId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitCost: 1 })).status).toBe(404);
    });
  });

  describe('consumption', () => {
    it('must be charged to a department or a project', async () => {
      const res = await keeper.post('/consumptions').send({ warehouseId: whId, itemId, quantity: 10 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/department or a project/);
    });

    it('issues stock charged to a department, costed at the average cost', async () => {
      const res = await keeper.post('/consumptions').send({
        warehouseId: whId,
        itemId,
        quantity: 100.25,
        departmentId: deptId,
        projectId,
        issuedTo: 'A. Musa',
        purpose: 'Cabling at substation',
      });
      expect(res.status).toBe(201);
      consumptionId = res.body.id;
      expect(Number(res.body.unitCost)).toBe(4.8);
      expect(Number(res.body.total)).toBe(481.2);
      expect(await onHand()).toBe(899.75);
    });

    it('cannot issue more than is on hand', async () => {
      const res = await keeper.post('/consumptions').send({ warehouseId: whId, itemId, quantity: 5000, departmentId: deptId });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Insufficient stock/);
      expect(await onHand()).toBe(899.75);
    });

    it('lists consumption filtered by department and project', async () => {
      const byDept = await admin.get(`/consumptions?organizationId=${orgId}&departmentId=${deptId}`);
      expect(byDept.body).toHaveLength(1);
      expect(byDept.body[0]).toMatchObject({ issuedTo: 'A. Musa' });
      expect(byDept.body[0].project.code).toBe('PRJ-1');

      const other = await admin.get(`/consumptions?organizationId=${orgId}&projectId=00000000-0000-0000-0000-000000000000`);
      expect(other.body).toHaveLength(0);
    });
  });

  describe('stock take', () => {
    it('requires a reason', async () => {
      const res = await keeper.post('/stock-transactions/adjust').send({ itemId, warehouseId: whId, countedQuantity: 890, reason: ' ' });
      expect(res.status).toBe(400);
    });

    it('posts the difference between the count and the system quantity', async () => {
      const res = await keeper
        .post('/stock-transactions/adjust')
        .send({ itemId, warehouseId: whId, countedQuantity: 890, reason: 'Physical stock count' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'ADJUSTMENT', quantity: -9.75, balanceAfter: 890, notes: 'Physical stock count' });
      expect(await onHand()).toBe(890);
    });

    it('refuses a count that matches the system', async () => {
      const res = await keeper.post('/stock-transactions/adjust').send({ itemId, warehouseId: whId, countedQuantity: 890, reason: 'again' });
      expect(res.status).toBe(400);
    });
  });

  describe('overview and reorder status', () => {
    it('reports total on hand, value at average cost, and status', async () => {
      const res = await admin.get(`/inventory-items/overview?organizationId=${orgId}`);
      expect(res.status).toBe(200);
      const row = res.body.find((r: { id: string }) => r.id === itemId);
      expect(row).toMatchObject({ totalOnHand: 890, status: 'IN_STOCK' });
      expect(Number(row.stockValue)).toBe(4272);
      expect(row.category.name).toBe('Electrical');
    });

    it('flags LOW_STOCK once the count falls to the reorder point', async () => {
      await keeper.post('/stock-transactions/adjust').send({ itemId, warehouseId: whId, countedQuantity: 150, reason: 'Damage write-off' });
      const res = await admin.get(`/inventory-items/overview?organizationId=${orgId}`);
      expect(res.body.find((r: { id: string }) => r.id === itemId).status).toBe('LOW_STOCK');

      await keeper.post('/stock-transactions/adjust').send({ itemId, warehouseId: whId, countedQuantity: 890, reason: 'Recount' });
    });
  });

  describe('deleting records posts reversals', () => {
    it('only admin can delete a purchase or an issue', async () => {
      expect((await keeper.delete(`/purchases/${purchaseId}`)).status).toBe(403);
      expect((await keeper.delete(`/consumptions/${consumptionId}`)).status).toBe(403);
    });

    it('deleting an issue puts the stock back and posts a REVERSAL', async () => {
      const before = await onHand();
      const res = await admin.delete(`/consumptions/${consumptionId}`);
      expect(res.status).toBe(200);
      expect(await onHand()).toBe(before + 100.25);

      const ledger = await admin.get(`/stock-transactions?itemId=${itemId}&type=REVERSAL`);
      expect(ledger.body[0]).toMatchObject({ refType: 'ISSUE_DELETED', refId: consumptionId, quantity: 100.25 });

      const list = await admin.get(`/consumptions?organizationId=${orgId}`);
      expect(list.body).toHaveLength(0);
      expect((await admin.delete(`/consumptions/${consumptionId}`)).status).toBe(404);
    });

    it('deleting a purchase takes that stock back out and drops it from the list', async () => {
      const before = await onHand();
      expect((await admin.delete(`/purchases/${purchaseId}`)).status).toBe(200);
      expect(await onHand()).toBe(before - 199.5);
      expect((await admin.get(`/purchases?organizationId=${orgId}`)).body).toHaveLength(0);
    });

    it('refuses to delete a purchase whose stock has since been issued', async () => {
      const p = await keeper.post('/purchases').send({ warehouseId: whId, itemId, vendorId, quantity: 50, unitCost: 5 });
      // Issue everything on hand so the purchase can no longer be undone.
      await keeper.post('/consumptions').send({ warehouseId: whId, itemId, quantity: await onHand(), departmentId: deptId });

      const res = await admin.delete(`/purchases/${p.body.id}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Insufficient stock/);
    });
  });

  describe('deleting an item', () => {
    it('is admin only and refused while stock remains', async () => {
      expect((await keeper.delete(`/inventory-items/${itemId}`)).status).toBe(403);

      const fresh = await keeper.post('/inventory-items').send({
        organizationId: orgId, sku: 'HX-GONE', name: 'Gone', unitOfMeasure: 'pcs', openingStock: 3, openingWarehouseId: whId,
      });
      const blocked = await admin.delete(`/inventory-items/${fresh.body.id}`);
      expect(blocked.status).toBe(400);
      expect(blocked.body.message).toMatch(/zero stock/);
    });

    it('soft-deletes an item at zero stock: it vanishes from lists and 404s, but history stays', async () => {
      const gone = await keeper.post('/inventory-items').send({ organizationId: orgId, sku: 'HX-EMPTY', name: 'Empty', unitOfMeasure: 'pcs' });
      expect((await admin.delete(`/inventory-items/${gone.body.id}`)).status).toBe(200);

      expect((await admin.get(`/inventory-items/${gone.body.id}`)).status).toBe(404);
      const list = await admin.get(`/inventory-items?organizationId=${orgId}`);
      expect(list.body.some((i: { id: string }) => i.id === gone.body.id)).toBe(false);
      const overview = await admin.get(`/inventory-items/overview?organizationId=${orgId}`);
      expect(overview.body.some((i: { id: string }) => i.id === gone.body.id)).toBe(false);
    });
  });

  it('the ledger reconciles to the on-hand balance, including reversals', async () => {
    const res = await admin.get(`/stock-transactions?itemId=${itemId}`);
    const total = res.body.reduce((sum: number, t: { quantity: number }) => sum + t.quantity, 0);
    expect(Math.round(total * 1000) / 1000).toBe(await onHand());
  });
});
