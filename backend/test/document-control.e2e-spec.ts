import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Document Control (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;
  let adminUserId: string;
  let financeUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');

    const org = await admin.post('/organizations').send({ name: 'DocCo' });
    orgId = org.body.id;

    adminUserId = await provisionUser(app, prisma, 'admin');
    financeUserId = await provisionUser(app, prisma, 'finance');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  let docId: string;
  let v1Id: string;

  it('POST /documents requires a file', async () => {
    const res = await admin.post('/documents').field('organizationId', orgId).field('title', 'No File');
    expect(res.status).toBe(400);
  });

  it('POST /documents creates a document + version 1', async () => {
    const res = await admin
      .post('/documents')
      .field('organizationId', orgId)
      .field('title', 'Safety SOP')
      .field('category', 'HSE')
      .attach('file', Buffer.from('v1 content'), 'sop.txt');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.currentVersion).toBe(1);
    expect(res.body.versions).toHaveLength(1);
    docId = res.body.id;
    v1Id = res.body.versions[0].id;
  });

  it('GET /documents/:id returns detail', async () => {
    const res = await admin.get(`/documents/${docId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(docId);
  });

  it('GET /documents/:id/versions/:versionId/download returns a fetchable URL with the right content', async () => {
    const res = await admin.get(`/documents/${docId}/versions/${v1Id}/download`);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('http');

    const fileRes = await fetch(res.body.url);
    const text = await fileRes.text();
    expect(text).toBe('v1 content');
  });

  it('POST /documents/:id/submit rejects a reviewer without document_control/admin role', async () => {
    const res = await admin.post(`/documents/${docId}/submit`).send({ reviewerIds: [financeUserId] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/document_control or admin role/);
  });

  it('POST /documents/:id/submit rejects an unknown reviewerId', async () => {
    const res = await admin
      .post(`/documents/${docId}/submit`)
      .send({ reviewerIds: ['00000000-0000-0000-0000-000000000000'] });
    expect(res.status).toBe(400);
  });

  it('POST /documents/:id/submit rejects an empty reviewerIds list', async () => {
    const res = await admin.post(`/documents/${docId}/submit`).send({ reviewerIds: [] });
    expect(res.status).toBe(400);
  });

  it('POST /documents/:id/submit succeeds with an eligible (admin) reviewer', async () => {
    const res = await admin.post(`/documents/${docId}/submit`).send({ reviewerIds: [adminUserId] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('IN_REVIEW');
    expect(res.body.versions[0].approvals).toHaveLength(1);
    expect(res.body.versions[0].approvals[0].status).toBe('PENDING');
  });

  it('POST /documents/:id/review rejects a non-assigned reviewer', async () => {
    const res = await asRole(app, 'finance')
      .post(`/documents/${docId}/review`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  it('POST /documents/:id/review approves and flips the document to APPROVED', async () => {
    const res = await admin.post(`/documents/${docId}/review`).send({ status: 'APPROVED', comment: 'lgtm' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
  });

  it('POST /documents/:id/review rejects a second decision on the same version', async () => {
    const res = await admin.post(`/documents/${docId}/review`).send({ status: 'APPROVED' });
    expect(res.status).toBe(400);
  });

  it('POST /documents/:id/versions uploads v2 and resets status to DRAFT, keeping v1 history', async () => {
    const res = await admin
      .post(`/documents/${docId}/versions`)
      .attach('file', Buffer.from('v2 content'), 'sop-v2.txt');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.currentVersion).toBe(2);
    expect(res.body.versions).toHaveLength(2);
  });

  it('rejection path: submit, reject, and confirm status', async () => {
    const created = await admin
      .post('/documents')
      .field('organizationId', orgId)
      .field('title', 'Reject Me')
      .attach('file', Buffer.from('v1'), 'reject.txt');
    const id = created.body.id;

    await admin.post(`/documents/${id}/submit`).send({ reviewerIds: [adminUserId] });
    const rejected = await admin
      .post(`/documents/${id}/review`)
      .send({ status: 'REJECTED', comment: 'needs work' });

    expect(rejected.status).toBe(201);
    expect(rejected.body.status).toBe('REJECTED');
  });

  it('GET /documents filters by organizationId and status', async () => {
    // docId went back to DRAFT after the v2 upload above, so it's the
    // REJECTED doc from the previous test that should show under DRAFT
    // filtering here instead — filters are exercised, not a fixed doc.
    const res = await admin.get(`/documents?organizationId=${orgId}&status=DRAFT`);
    expect(res.status).toBe(200);
    expect(res.body.every((d: { status: string }) => d.status === 'DRAFT')).toBe(true);
    expect(res.body.every((d: { organizationId: string }) => d.organizationId === orgId)).toBe(true);
    expect(res.body.some((d: { id: string }) => d.id === docId)).toBe(true);
  });
});
