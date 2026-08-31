import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Departments (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');

    const org = await admin.post('/organizations').send({ name: 'Dept Test Org' });
    orgId = org.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let deptId: string;

  it('POST /departments creates a department', async () => {
    const res = await admin.post('/departments').send({ organizationId: orgId, code: 'FIN', name: 'Finance' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('FIN');
    deptId = res.body.id;
  });

  it('POST /departments rejects a duplicate code within the same organization', async () => {
    const res = await admin.post('/departments').send({ organizationId: orgId, code: 'FIN', name: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('GET /departments lists it, filterable by organizationId', async () => {
    const res = await admin.get('/departments').query({ organizationId: orgId });
    expect(res.status).toBe(200);
    expect(res.body.some((d: { id: string }) => d.id === deptId)).toBe(true);
  });

  it('GET /departments/:id returns detail', async () => {
    const res = await admin.get(`/departments/${deptId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(deptId);
  });

  it('GET /departments/:id 404s for an unknown id', async () => {
    const res = await admin.get('/departments/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('PATCH /departments/:id renames a department', async () => {
    const res = await admin.patch(`/departments/${deptId}`).send({ name: 'Finance & Treasury' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Finance & Treasury');
  });

  it('PATCH /departments/:id 404s for an unknown id', async () => {
    const res = await admin
      .patch('/departments/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('POST /departments is restricted to admin', async () => {
    const res = await asRole(app, 'finance')
      .post('/departments')
      .send({ organizationId: orgId, code: 'OPS', name: 'Operations' });
    expect(res.status).toBe(403);
  });

  it('PATCH /departments/:id is restricted to admin', async () => {
    const res = await asRole(app, 'finance').patch(`/departments/${deptId}`).send({ name: 'Should Fail' });
    expect(res.status).toBe(403);
  });
});
