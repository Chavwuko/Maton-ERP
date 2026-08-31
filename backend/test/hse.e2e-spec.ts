import { INestApplication } from '@nestjs/common';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';
import { PrismaClient } from '@prisma/client';

describe('HSE (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;
  let adminUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    const org = await admin.post('/organizations').send({ name: 'HseCo' });
    orgId = org.body.id;
    adminUserId = await provisionUser(app, prisma, 'admin');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('POST /incidents is open to any authenticated user', async () => {
    const res = await asRole(app, 'finance').post('/incidents').send({
      organizationId: orgId,
      title: 'Slip near pump station',
      type: 'NEAR_MISS',
      severity: 'LOW',
      occurredAt: '2026-08-31T08:00:00.000Z',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REPORTED');
  });

  it('a minor incident can close directly with no corrective actions', async () => {
    const created = await admin.post('/incidents').send({
      organizationId: orgId,
      title: 'Minor near-miss',
      type: 'NEAR_MISS',
      severity: 'LOW',
      occurredAt: '2026-08-31T08:00:00.000Z',
    });
    const closed = await admin.patch(`/incidents/${created.body.id}/status`).send({ status: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('CLOSED');
  });

  let incidentId: string;

  it('a serious incident walks through investigation with a guarded transition', async () => {
    const created = await admin.post('/incidents').send({
      organizationId: orgId,
      title: 'Hand injury during pump repair',
      type: 'INJURY',
      severity: 'HIGH',
      occurredAt: '2026-08-31T09:00:00.000Z',
    });
    incidentId = created.body.id;

    const invalid = await admin
      .patch(`/incidents/${incidentId}/status`)
      .send({ status: 'CORRECTIVE_ACTION' });
    expect(invalid.status).toBe(400);

    const toInvestigation = await admin
      .patch(`/incidents/${incidentId}/status`)
      .send({ status: 'UNDER_INVESTIGATION' });
    expect(toInvestigation.status).toBe(200);

    const toCorrective = await admin
      .patch(`/incidents/${incidentId}/status`)
      .send({ status: 'CORRECTIVE_ACTION' });
    expect(toCorrective.status).toBe(200);
  });

  let action1Id: string;
  let action2Id: string;

  it('adds two corrective actions', async () => {
    const a1 = await admin.post(`/incidents/${incidentId}/corrective-actions`).send({
      description: 'Install machine guarding',
      assignedToId: adminUserId,
      dueDate: '2026-09-15T00:00:00.000Z',
    });
    const a2 = await admin.post(`/incidents/${incidentId}/corrective-actions`).send({
      description: 'Retrain crew on lockout-tagout',
      assignedToId: adminUserId,
      dueDate: '2026-09-20T00:00:00.000Z',
    });
    expect(a1.status).toBe(201);
    expect(a2.status).toBe(201);
    action1Id = a1.body.id;
    action2Id = a2.body.id;
  });

  it('blocks CLOSE while corrective actions are still open, naming the count', async () => {
    const res = await admin.patch(`/incidents/${incidentId}/status`).send({ status: 'CLOSED' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/2 corrective action/);
  });

  it('still blocks CLOSE with one remaining', async () => {
    await admin.patch(`/incidents/${incidentId}/corrective-actions/${action1Id}`).send({ status: 'COMPLETED' });
    const res = await admin.patch(`/incidents/${incidentId}/status`).send({ status: 'CLOSED' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1 corrective action/);
  });

  it('allows CLOSE once every corrective action is COMPLETED', async () => {
    await admin.patch(`/incidents/${incidentId}/corrective-actions/${action2Id}`).send({ status: 'COMPLETED' });
    const res = await admin.patch(`/incidents/${incidentId}/status`).send({ status: 'CLOSED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });

  it('rejects any transition once CLOSED (terminal)', async () => {
    const res = await admin
      .patch(`/incidents/${incidentId}/status`)
      .send({ status: 'UNDER_INVESTIGATION' });
    expect(res.status).toBe(400);
  });

  it('a document created with incidentId links to the incident both ways', async () => {
    const doc = await admin
      .post('/documents')
      .field('organizationId', orgId)
      .field('incidentId', incidentId)
      .field('title', 'Incident Scene Photo')
      .attach('file', Buffer.from('photo'), 'scene.txt');
    expect(doc.status).toBe(201);

    const filtered = await admin.get(`/documents?incidentId=${incidentId}`);
    expect(filtered.body).toHaveLength(1);

    const detail = await admin.get(`/incidents/${incidentId}`);
    expect(detail.body.documents).toHaveLength(1);
  });
});
