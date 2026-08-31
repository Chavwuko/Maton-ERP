import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Assets + Maintenance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    const org = await admin.post('/organizations').send({ name: 'MaintCo' });
    orgId = org.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  let assetId: string;

  it('POST /assets is restricted to admin/maintenance', async () => {
    const res = await asRole(app, 'finance')
      .post('/assets')
      .send({ organizationId: orgId, assetTag: 'PUMP-001', name: 'Feed Pump A', category: 'Rotating' });
    expect(res.status).toBe(403);
  });

  it('POST /assets creates an asset in ACTIVE status', async () => {
    const res = await admin
      .post('/assets')
      .send({ organizationId: orgId, assetTag: 'PUMP-001', name: 'Feed Pump A', category: 'Rotating' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
    assetId = res.body.id;
  });

  it('POST /assets rejects a duplicate assetTag in the same org with 409', async () => {
    const res = await admin
      .post('/assets')
      .send({ organizationId: orgId, assetTag: 'PUMP-001', name: 'Dup', category: 'x' });
    expect(res.status).toBe(409);
  });

  let workOrderId: string;

  it('POST /work-orders is open to any authenticated user', async () => {
    const res = await asRole(app, 'finance')
      .post('/work-orders')
      .send({ organizationId: orgId, assetId, title: 'Vibration issue', priority: 'HIGH' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    workOrderId = res.body.id;
  });

  it('PATCH /work-orders/:id/status rejects OPEN -> COMPLETED (must go through IN_PROGRESS)', async () => {
    const res = await admin.patch(`/work-orders/${workOrderId}/status`).send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });

  it('PATCH /work-orders/:id/status is restricted to admin/maintenance', async () => {
    const res = await asRole(app, 'finance')
      .patch(`/work-orders/${workOrderId}/status`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(403);
  });

  it('moving to IN_PROGRESS flips the asset to UNDER_MAINTENANCE', async () => {
    const wo = await admin.patch(`/work-orders/${workOrderId}/status`).send({ status: 'IN_PROGRESS' });
    expect(wo.status).toBe(200);

    const asset = await admin.get(`/assets/${assetId}`);
    expect(asset.body.status).toBe('UNDER_MAINTENANCE');
  });

  it('completing the only active work order flips the asset back to ACTIVE', async () => {
    const wo = await admin.patch(`/work-orders/${workOrderId}/status`).send({ status: 'COMPLETED' });
    expect(wo.status).toBe(200);
    expect(wo.body.completedAt).not.toBeNull();

    const asset = await admin.get(`/assets/${assetId}`);
    expect(asset.body.status).toBe('ACTIVE');
  });

  it('asset stays UNDER_MAINTENANCE while a second concurrent work order is still open', async () => {
    const wo1 = await admin.post('/work-orders').send({ organizationId: orgId, assetId, title: 'WO1' });
    const wo2 = await admin.post('/work-orders').send({ organizationId: orgId, assetId, title: 'WO2' });

    await admin.patch(`/work-orders/${wo1.body.id}/status`).send({ status: 'IN_PROGRESS' });
    await admin.patch(`/work-orders/${wo2.body.id}/status`).send({ status: 'IN_PROGRESS' });

    await admin.patch(`/work-orders/${wo1.body.id}/status`).send({ status: 'COMPLETED' });
    const stillDown = await admin.get(`/assets/${assetId}`);
    expect(stillDown.body.status).toBe('UNDER_MAINTENANCE');

    await admin.patch(`/work-orders/${wo2.body.id}/status`).send({ status: 'CANCELLED' });
    const backUp = await admin.get(`/assets/${assetId}`);
    expect(backUp.body.status).toBe('ACTIVE');
  });

  it('rejects opening a work order against a DECOMMISSIONED asset', async () => {
    await prisma.asset.update({ where: { id: assetId }, data: { status: 'DECOMMISSIONED' } });

    const res = await admin
      .post('/work-orders')
      .send({ organizationId: orgId, assetId, title: 'Should be rejected' });
    expect(res.status).toBe(400);
  });
});
