import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Organizations (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
  });

  afterAll(async () => {
    await app.close();
  });

  let orgId: string;

  it('POST /organizations creates an organization', async () => {
    const res = await admin.post('/organizations').send({ name: 'Acme Industrial' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Industrial');
    orgId = res.body.id;
  });

  it('GET /organizations lists it', async () => {
    const res = await admin.get('/organizations');
    expect(res.status).toBe(200);
    expect(res.body.some((o: { id: string }) => o.id === orgId)).toBe(true);
  });

  it('GET /organizations/:id returns detail', async () => {
    const res = await admin.get(`/organizations/${orgId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orgId);
  });

  it('GET /organizations/:id 404s for an unknown id', async () => {
    const res = await admin.get('/organizations/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('POST /organizations is restricted to admin', async () => {
    const res = await asRole(app, 'finance').post('/organizations').send({ name: 'Should Fail' });
    expect(res.status).toBe(403);
  });
});
