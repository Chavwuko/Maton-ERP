import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Exercises the self-sign-up -> admin-approval flow end to end through the
// local-dev `x-local-signup` header, which behaves like a real first login
// by that email (see LocalDevAuthGuard).
describe('User access requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let departmentId: string;
  const run = Date.now();
  const domain = 'access-e2e.test';
  const email = (name: string) => `${name}.${run}@${domain}`;

  const asSignup = (who: string) => {
    const server = app.getHttpServer();
    const header = { 'x-local-signup': who };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
    };
  };

  const userIdFor = async (who: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { cognitoSub: `local-signup|${who}` } })).id;

  const setAccess = (body: { openSignup?: boolean; allowedEmailDomains?: string[] }) => {
    const server = app.getHttpServer();
    return request(server).put('/settings/access').set('x-local-role', 'admin').send(body);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');

    const org = await admin.post('/organizations').send({ name: `Access Org ${run}` });
    const dept = await admin
      .post('/departments')
      .send({ organizationId: org.body.id, code: `AC${run}`, name: 'Stores' });
    departmentId = dept.body.id;
    await setAccess({ openSignup: true, allowedEmailDomains: [] });
  });

  afterAll(async () => {
    await setAccess({ openSignup: true, allowedEmailDomains: [] });
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('puts a first-time sign-up in the queue and keeps them out of the app', async () => {
    const who = email('queue');

    const me = await asSignup(who).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: who, status: 'PENDING', roleName: null });

    const blocked = await asSignup(who).get('/organizations');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Your account is awaiting administrator approval');

    // The request form needs the department list, so that one read stays open.
    expect((await asSignup(who).get('/departments')).status).toBe(200);
  });

  it('takes their details, shows the request to admins, and lets an admin approve it', async () => {
    const who = email('approve');
    await asSignup(who).get('/auth/me');

    const profile = await asSignup(who)
      .post('/auth/request-access')
      .send({ firstName: 'Ann', lastName: 'Store', phone: '555-0100', departmentId });
    expect(profile.status).toBe(201);
    expect(profile.body).toMatchObject({ firstName: 'Ann', lastName: 'Store', phone: '555-0100', status: 'PENDING' });
    expect(profile.body.requestedAt).toBeTruthy();

    const pending = await admin.get('/users').query({ status: 'PENDING' });
    expect(pending.status).toBe(200);
    expect(pending.body.map((u: { email: string }) => u.email)).toContain(who);

    // Only admins may approve.
    const id = await userIdFor(who);
    expect((await asRole(app, 'hse').post(`/users/${id}/approve`).send({ roleName: 'inventory' })).status).toBe(403);

    const approved = await admin.post(`/users/${id}/approve`).send({ roleName: 'inventory' });
    expect(approved.status).toBe(201);
    expect(approved.body).toMatchObject({
      status: 'ACTIVE',
      isActive: true,
      departmentId,
      role: { name: 'inventory' },
    });
    expect(approved.body.reviewedAt).toBeTruthy();

    const me = await asSignup(who).get('/auth/me');
    expect(me.body).toMatchObject({ status: 'ACTIVE', roleName: 'inventory' });
    expect((await asSignup(who).get('/organizations')).status).toBe(200);
  });

  it('does not list pending people as active users', async () => {
    const who = email('directory');
    await asSignup(who).get('/auth/me');

    const active = await admin.get('/users').query({ isActive: 'true' });

    expect(active.body.map((u: { email: string }) => u.email)).not.toContain(who);
  });

  it('rejects a request with a reason that the person can read, and blocks them', async () => {
    const who = email('reject');
    await asSignup(who).get('/auth/me');
    const id = await userIdFor(who);

    const rejected = await admin.post(`/users/${id}/reject`).send({ reason: 'Not a contractor of ours' });
    expect(rejected.status).toBe(201);
    expect(rejected.body.status).toBe('REJECTED');

    const me = await asSignup(who).get('/auth/me');
    expect(me.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Not a contractor of ours' });
    const blocked = await asSignup(who).get('/organizations');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Your access request was not approved');

    // A rejected person cannot re-submit, but an admin can still change their mind.
    expect(
      (await asSignup(who).post('/auth/request-access').send({ firstName: 'A', lastName: 'B' })).status,
    ).toBe(400);
    expect((await admin.post(`/users/${id}/approve`).send({ roleName: 'staff' })).status).toBe(201);
  });

  it('validates the access request and the review inputs', async () => {
    const who = email('validate');
    await asSignup(who).get('/auth/me');
    const id = await userIdFor(who);

    expect((await asSignup(who).post('/auth/request-access').send({ firstName: '', lastName: 'X' })).status).toBe(400);
    expect(
      (
        await asSignup(who)
          .post('/auth/request-access')
          .send({ firstName: 'A', lastName: 'B', departmentId: '00000000-0000-0000-0000-000000000000' })
      ).status,
    ).toBe(404);
    expect((await admin.post(`/users/${id}/approve`).send({ roleName: 'superuser' })).status).toBe(400);
    expect((await admin.get('/users').query({ status: 'BOGUS' })).status).toBe(400);
    expect((await admin.post(`/users/${id}/disable`)).status).toBe(400); // still pending
  });

  it('lets an admin change role and details, disable, and re-enable a user', async () => {
    const who = email('lifecycle');
    await asSignup(who).get('/auth/me');
    const id = await userIdFor(who);
    await admin.post(`/users/${id}/approve`).send({ roleName: 'staff' });

    const edited = await admin
      .patch(`/users/${id}`)
      .send({ roleName: 'inventory', firstName: 'Lee', lastName: 'Keeper', departmentId });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ firstName: 'Lee', role: { name: 'inventory' }, departmentId });

    const disabled = await admin.post(`/users/${id}/disable`);
    expect(disabled.body).toMatchObject({ status: 'DISABLED', isActive: false });
    expect((await asSignup(who).get('/organizations')).status).toBe(401);
    // ...but they can still ask who they are, so the app can say why.
    expect((await asSignup(who).get('/auth/me')).body.status).toBe('DISABLED');

    const enabled = await admin.post(`/users/${id}/enable`);
    expect(enabled.body).toMatchObject({ status: 'ACTIVE', isActive: true });
    expect((await asSignup(who).get('/organizations')).status).toBe(200);
  });

  it('will not let an admin disable themselves', async () => {
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@local.dev' } });

    const res = await admin.post(`/users/${adminUser.id}/disable`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You cannot disable your own account');
  });

  describe('access settings', () => {
    it('are admin only', async () => {
      expect((await asRole(app, 'hse').get('/settings/access')).status).toBe(403);
      expect((await request(app.getHttpServer()).put('/settings/access').set('x-local-role', 'hse').send({})).status).toBe(
        403,
      );
    });

    it('can be read and updated, normalising the domain list', async () => {
      const res = await setAccess({ openSignup: true, allowedEmailDomains: [` @${domain.toUpperCase()} `, domain] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ openSignup: true, allowedEmailDomains: [domain] });

      const read = await admin.get('/settings/access');
      expect(read.body).toEqual({ openSignup: true, allowedEmailDomains: [domain] });

      await setAccess({ allowedEmailDomains: [] });
    });

    it('turn away a new sign-up when sign-ups are closed', async () => {
      await setAccess({ openSignup: false });
      const who = email('closed');

      const me = await asSignup(who).get('/auth/me');

      expect(me.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Sign-ups are currently closed. Contact an administrator.',
      });
      await setAccess({ openSignup: true });
    });

    it('turn away a new sign-up from a domain that is not allowed', async () => {
      await setAccess({ allowedEmailDomains: ['someone-else.test'] });
      const who = email('domain');

      const me = await asSignup(who).get('/auth/me');

      expect(me.body.status).toBe('REJECTED');
      expect(me.body.rejectionReason).toMatch(/domain is not allowed/);
      await setAccess({ allowedEmailDomains: [] });
    });

    it('rejects values of the wrong type', async () => {
      expect((await setAccess({ openSignup: 'no' as never })).status).toBe(400);
    });
  });
});
