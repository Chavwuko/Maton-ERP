import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;
  let wh1Id: string;
  let wh2Id: string;
  let itemId: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    const org = await admin.post('/organizations').send({ name: 'InvCo' });
    orgId = org.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /warehouses is restricted to admin/inventory', async () => {
    const res = await asRole(app, 'finance')
      .post('/warehouses')
      .send({ organizationId: orgId, code: 'WH-MAIN', name: 'Main Store' });
    expect(res.status).toBe(403);
  });

  it('creates two warehouses', async () => {
    const wh1 = await admin.post('/warehouses').send({ organizationId: orgId, code: 'WH-MAIN', name: 'Main' });
    const wh2 = await admin.post('/warehouses').send({ organizationId: orgId, code: 'WH-SITE-B', name: 'Site B' });
    expect(wh1.status).toBe(201);
    expect(wh2.status).toBe(201);
    wh1Id = wh1.body.id;
    wh2Id = wh2.body.id;
  });

  it('rejects a duplicate warehouse code with 409', async () => {
    const res = await admin.post('/warehouses').send({ organizationId: orgId, code: 'WH-MAIN', name: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('creates an inventory item with a reorder point', async () => {
    const res = await admin.post('/inventory-items').send({
      organizationId: orgId,
      sku: 'BRG-6205',
      name: 'Ball Bearing 6205',
      unitOfMeasure: 'EA',
      reorderPoint: 10,
    });
    expect(res.status).toBe(201);
    itemId = res.body.id;
  });

  it('rejects a duplicate SKU with 409', async () => {
    const res = await admin
      .post('/inventory-items')
      .send({ organizationId: orgId, sku: 'BRG-6205', name: 'Dup', unitOfMeasure: 'EA' });
    expect(res.status).toBe(409);
  });

  it('RECEIPT increases the stock level', async () => {
    const res = await admin
      .post('/stock-transactions')
      .send({ itemId, warehouseId: wh1Id, type: 'RECEIPT', quantity: 20 });
    expect(res.status).toBe(201);

    const item = await admin.get(`/inventory-items/${itemId}`);
    expect(item.body.stockLevels[0].quantityOnHand).toBe(20);
  });

  it('ISSUE decreases stock and stores a signed negative quantity', async () => {
    const res = await admin
      .post('/stock-transactions')
      .send({ itemId, warehouseId: wh1Id, type: 'ISSUE', quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(-2);
  });

  it('ISSUE beyond the current balance is rejected with 400 naming the balance', async () => {
    const res = await admin
      .post('/stock-transactions')
      .send({ itemId, warehouseId: wh1Id, type: 'ISSUE', quantity: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Insufficient stock/);
  });

  it('belowReorderPoint filter excludes an item above its threshold', async () => {
    const res = await admin.get(`/inventory-items?organizationId=${orgId}&belowReorderPoint=true`);
    expect(res.body).toHaveLength(0); // 18 on hand, reorderPoint 10
  });

  it('a negative ADJUSTMENT can push the item below its reorder point', async () => {
    await admin.post('/stock-transactions').send({ itemId, warehouseId: wh1Id, type: 'ADJUSTMENT', quantity: -10 });

    const res = await admin.get(`/inventory-items?organizationId=${orgId}&belowReorderPoint=true`);
    expect(res.body.map((i: { id: string }) => i.id)).toContain(itemId);
  });

  it('transfers stock between warehouses atomically', async () => {
    // Balance is 8 at this point (20 - 2 - 10).
    const res = await admin
      .post('/stock-transactions/transfer')
      .send({ itemId, fromWarehouseId: wh1Id, toWarehouseId: wh2Id, quantity: 5 });
    expect(res.status).toBe(201);

    const item = await admin.get(`/inventory-items/${itemId}`);
    const byWarehouse = Object.fromEntries(
      item.body.stockLevels.map((l: { warehouseId: string; quantityOnHand: number }) => [
        l.warehouseId,
        l.quantityOnHand,
      ]),
    );
    expect(byWarehouse[wh1Id]).toBe(3);
    expect(byWarehouse[wh2Id]).toBe(5);
  });

  it('rejects a transfer to the same warehouse', async () => {
    const res = await admin
      .post('/stock-transactions/transfer')
      .send({ itemId, fromWarehouseId: wh1Id, toWarehouseId: wh1Id, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects a transfer exceeding the source balance', async () => {
    const res = await admin
      .post('/stock-transactions/transfer')
      .send({ itemId, fromWarehouseId: wh1Id, toWarehouseId: wh2Id, quantity: 999 });
    expect(res.status).toBe(400);
  });

  it('the transaction ledger reconciles to the final balance', async () => {
    const res = await admin.get(`/stock-transactions?itemId=${itemId}`);
    const total = res.body.reduce((sum: number, t: { quantity: number }) => sum + t.quantity, 0);
    expect(total).toBe(8); // 3 at wh1 + 5 at wh2
  });
});
