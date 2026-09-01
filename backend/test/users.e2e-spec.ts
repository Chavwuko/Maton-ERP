import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let prisma: PrismaClient;
  let adminId: string;
  let hseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    prisma = new PrismaClient();

    adminId = await provisionUser(app, prisma, 'admin');
    hseId = await provisionUser(app, prisma, 'hse');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /users lists every provisioned user', async () => {
    const res = await admin.get('/users');
    expect(res.status).toBe(200);
    const ids = res.body.map((u: { id: string }) => u.id);
    expect(ids).toEqual(expect.arrayContaining([adminId, hseId]));
  });

  it('GET /users?role= filters to that role only', async () => {
    const res = await admin.get('/users').query({ role: 'hse' });
    expect(res.status).toBe(200);
    expect(res.body.every((u: { role: { name: string } | null }) => u.role?.name === 'hse')).toBe(true);
    expect(res.body.some((u: { id: string }) => u.id === hseId)).toBe(true);
    expect(res.body.some((u: { id: string }) => u.id === adminId)).toBe(false);
  });

  it('GET /users/:id returns the user with its role nested', async () => {
    const res = await admin.get(`/users/${adminId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(res.body.role.name).toBe('admin');
  });

  it('GET /users/:id 404s for an unknown id', async () => {
    const res = await admin.get('/users/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('GET /users is not restricted to any particular role', async () => {
    const res = await asRole(app, 'finance').get('/users');
    expect(res.status).toBe(200);
  });
});
