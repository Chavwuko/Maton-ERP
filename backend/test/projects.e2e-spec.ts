import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Project Control (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    const org = await admin.post('/organizations').send({ name: 'ProjCo' });
    orgId = org.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let projectId: string;

  it('POST /projects is restricted to admin/project_control', async () => {
    const res = await asRole(app, 'finance')
      .post('/projects')
      .send({ organizationId: orgId, code: 'PRJ-001', name: 'Refinery Turnaround' });
    expect(res.status).toBe(403);
  });

  it('POST /projects creates a project in PLANNED status', async () => {
    const res = await admin
      .post('/projects')
      .send({ organizationId: orgId, code: 'PRJ-001', name: 'Refinery Turnaround', budget: 500000 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PLANNED');
    projectId = res.body.id;
  });

  it('POST /projects rejects a duplicate code in the same org with 409', async () => {
    const res = await admin
      .post('/projects')
      .send({ organizationId: orgId, code: 'PRJ-001', name: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('GET /projects/:id returns detail with empty milestones/documents', async () => {
    const res = await admin.get(`/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.milestones).toEqual([]);
    expect(res.body.documents).toEqual([]);
  });

  it('PATCH /projects/:id/status rejects PLANNED -> ON_HOLD', async () => {
    const res = await admin.patch(`/projects/${projectId}/status`).send({ status: 'ON_HOLD' });
    expect(res.status).toBe(400);
  });

  it('walks the full status lifecycle: PLANNED -> ACTIVE -> ON_HOLD -> ACTIVE -> CLOSED', async () => {
    for (const status of ['ACTIVE', 'ON_HOLD', 'ACTIVE', 'CLOSED']) {
      const res = await admin.patch(`/projects/${projectId}/status`).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('PATCH /projects/:id/status rejects any transition once CLOSED (terminal)', async () => {
    const res = await admin.patch(`/projects/${projectId}/status`).send({ status: 'ACTIVE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/terminal/);
  });

  describe('milestones', () => {
    let secondProjectId: string;
    let milestoneId: string;

    beforeAll(async () => {
      const res = await admin
        .post('/projects')
        .send({ organizationId: orgId, code: 'PRJ-002', name: 'Pipeline Expansion' });
      secondProjectId = res.body.id;
    });

    it('POST /projects/:id/milestones creates a milestone', async () => {
      const res = await admin.post(`/projects/${secondProjectId}/milestones`).send({
        name: 'Permit approval',
        dueDate: '2026-09-15T00:00:00.000Z',
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      milestoneId = res.body.id;
    });

    it('PATCH .../milestones/:id sets COMPLETED and stamps completedAt', async () => {
      const res = await admin
        .patch(`/projects/${secondProjectId}/milestones/${milestoneId}`)
        .send({ status: 'COMPLETED' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.completedAt).not.toBeNull();
    });

    it('a milestone under the wrong project 404s', async () => {
      const res = await admin.patch(
        `/projects/00000000-0000-0000-0000-000000000000/milestones/${milestoneId}`,
      ).send({ status: 'PENDING' });
      expect(res.status).toBe(404);
    });
  });

  describe('document linking', () => {
    let linkedProjectId: string;

    beforeAll(async () => {
      const res = await admin
        .post('/projects')
        .send({ organizationId: orgId, code: 'PRJ-003', name: 'Doc Link Project' });
      linkedProjectId = res.body.id;
    });

    it('a document created with projectId shows up under the project and the documents filter', async () => {
      const doc = await admin
        .post('/documents')
        .field('organizationId', orgId)
        .field('projectId', linkedProjectId)
        .field('title', 'Right-of-Way Permit')
        .attach('file', Buffer.from('permit'), 'permit.txt');
      expect(doc.status).toBe(201);

      const filtered = await admin.get(`/documents?projectId=${linkedProjectId}`);
      expect(filtered.body).toHaveLength(1);

      const detail = await admin.get(`/projects/${linkedProjectId}`);
      expect(detail.body.documents).toHaveLength(1);
    });
  });
});
