import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('HR (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;

  // A small manager hierarchy so a 360 appraisal can exercise all four
  // relation types: admin manages finance and hse; finance manages
  // maintenance. docControl is a fifth employee, deliberately left out of
  // every appraisal to test the "not an assigned reviewer" guard.
  let adminUserId: string;
  let financeUserId: string;
  let hseUserId: string;
  let maintUserId: string;
  let docControlUserId: string;

  let empAdmin: string;
  let empFinance: string;
  let empHse: string;
  let empMaint: string;
  let empDocControl: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');
    const org = await admin.post('/organizations').send({ name: 'HrCo' });
    orgId = org.body.id;

    adminUserId = await provisionUser(app, prisma, 'admin');
    financeUserId = await provisionUser(app, prisma, 'finance');
    hseUserId = await provisionUser(app, prisma, 'hse');
    maintUserId = await provisionUser(app, prisma, 'maintenance');
    docControlUserId = await provisionUser(app, prisma, 'document_control');

    const mkEmployee = async (userId: string, employeeNumber: string, jobTitle: string, managerId?: string) => {
      const res = await admin
        .post('/employees')
        .send({ organizationId: orgId, userId, employeeNumber, jobTitle, hireDate: '2022-01-01T00:00:00.000Z', managerId });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };

    empAdmin = await mkEmployee(adminUserId, 'EMP-001', 'Operations Manager');
    empFinance = await mkEmployee(financeUserId, 'EMP-002', 'Finance Lead', empAdmin);
    empHse = await mkEmployee(hseUserId, 'EMP-003', 'HSE Officer', empAdmin);
    empMaint = await mkEmployee(maintUserId, 'EMP-004', 'Maintenance Analyst', empFinance);
    empDocControl = await mkEmployee(docControlUserId, 'EMP-005', 'Document Controller');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('employees', () => {
    it('rejects a second employee record for the same user (409)', async () => {
      const res = await admin.post('/employees').send({
        organizationId: orgId,
        userId: adminUserId,
        employeeNumber: 'EMP-999',
        jobTitle: 'Dup',
        hireDate: '2022-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already has an employee record/);
    });

    it('rejects a duplicate employeeNumber for a different user (409, distinct message)', async () => {
      const freshUser = await provisionUser(app, prisma, 'inventory');
      const res = await admin.post('/employees').send({
        organizationId: orgId,
        userId: freshUser,
        employeeNumber: 'EMP-002',
        jobTitle: 'Dup',
        hireDate: '2022-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Employee number/);
    });

    it('GET /employees/me resolves the caller\'s own record', async () => {
      const res = await admin.get('/employees/me');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(empAdmin);
    });

    it('GET /employees/me 404s for a user with no employee record', async () => {
      const res = await asRole(app, 'project_control').get('/employees/me');
      expect(res.status).toBe(404);
    });

    it('self-service upload sets employeeId/organizationId from the caller\'s own record', async () => {
      const res = await admin
        .post('/employees/me/documents')
        .field('title', 'National ID Card')
        .field('category', 'Identification')
        .attach('file', Buffer.from('id-card'), 'id.txt');
      expect(res.status).toBe(201);
      expect(res.body.employeeId).toBe(empAdmin);
      expect(res.body.organizationId).toBe(orgId);

      const mine = await admin.get('/employees/me/documents');
      expect(mine.body.some((d: { id: string }) => d.id === res.body.id)).toBe(true);
    });

    it('self-service upload 404s for a user with no employee record', async () => {
      const res = await asRole(app, 'project_control')
        .post('/employees/me/documents')
        .field('title', 'Should fail')
        .attach('file', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(404);
    });

    it('TERMINATED is a terminal employment status', async () => {
      await admin.patch(`/employees/${empMaint}/status`).send({ employmentStatus: 'ON_LEAVE' });
      const terminated = await admin.patch(`/employees/${empMaint}/status`).send({ employmentStatus: 'TERMINATED' });
      expect(terminated.status).toBe(200);

      const blocked = await admin.patch(`/employees/${empMaint}/status`).send({ employmentStatus: 'ACTIVE' });
      expect(blocked.status).toBe(400);
    });
  });

  describe('360-degree appraisals', () => {
    let cycleId: string;
    let appraisalId: string;

    it('creates a cycle in DRAFT', async () => {
      const res = await admin.post('/appraisal-cycles').send({
        organizationId: orgId,
        name: '2026 H2 Review',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-30T00:00:00.000Z',
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      cycleId = res.body.id;
    });

    it('creates a 360 appraisal with self, manager, peer, and subordinate reviewers', async () => {
      const res = await admin.post(`/appraisal-cycles/${cycleId}/appraisals`).send({
        employeeId: empFinance,
        reviewers: [
          { employeeId: empFinance, relationType: 'SELF' },
          { employeeId: empAdmin, relationType: 'MANAGER' },
          { employeeId: empHse, relationType: 'PEER' },
          { employeeId: empMaint, relationType: 'SUBORDINATE' },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.reviewers).toHaveLength(4);
      appraisalId = res.body.id;
    });

    it('rejects a duplicate appraisal for the same employee in the same cycle (409)', async () => {
      const res = await admin.post(`/appraisal-cycles/${cycleId}/appraisals`).send({
        employeeId: empFinance,
        reviewers: [{ employeeId: empFinance, relationType: 'SELF' }],
      });
      expect(res.status).toBe(409);
    });

    it('rejects an unknown reviewer employeeId (400)', async () => {
      const res = await admin.post(`/appraisal-cycles/${cycleId}/appraisals`).send({
        employeeId: empHse,
        reviewers: [{ employeeId: '00000000-0000-0000-0000-000000000000', relationType: 'PEER' }],
      });
      expect(res.status).toBe(400);
    });

    it('rejects a review from an employee not assigned to the appraisal (403)', async () => {
      const res = await asRole(app, 'document_control')
        .post(`/appraisals/${appraisalId}/reviews`)
        .send({ rating: 3 });
      expect(res.status).toBe(403);
    });

    it('rejects an out-of-range rating', async () => {
      const res = await asRole(app, 'finance').post(`/appraisals/${appraisalId}/reviews`).send({ rating: 7 });
      expect(res.status).toBe(400);
    });

    it('SELF submits and the appraisal moves to IN_PROGRESS', async () => {
      const res = await asRole(app, 'finance')
        .post(`/appraisals/${appraisalId}/reviews`)
        .send({ rating: 4, comments: 'Met most goals' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('rejects a second submission from the same reviewer', async () => {
      const res = await asRole(app, 'finance').post(`/appraisals/${appraisalId}/reviews`).send({ rating: 3 });
      expect(res.status).toBe(400);
    });

    it('remaining reviewers submit and the appraisal auto-completes with the averaged rating', async () => {
      await admin.post(`/appraisals/${appraisalId}/reviews`).send({ rating: 5, comments: 'Strong quarter' });
      await asRole(app, 'hse').post(`/appraisals/${appraisalId}/reviews`).send({ rating: 4 });

      const before = await admin.get(`/appraisals/${appraisalId}`);
      expect(before.body.status).toBe('IN_PROGRESS');

      const final = await asRole(app, 'maintenance')
        .post(`/appraisals/${appraisalId}/reviews`)
        .send({ rating: 3, comments: 'Could delegate more' });
      expect(final.status).toBe(201);
      expect(final.body.status).toBe('COMPLETED');
      // (4 + 5 + 4 + 3) / 4 = 4
      expect(Number(final.body.overallRating)).toBe(4);
    });

    it('blocks closing the cycle while a second appraisal is still incomplete', async () => {
      const second = await admin.post(`/appraisal-cycles/${cycleId}/appraisals`).send({
        employeeId: empHse,
        reviewers: [
          { employeeId: empHse, relationType: 'SELF' },
          { employeeId: empAdmin, relationType: 'MANAGER' },
        ],
      });

      await admin.patch(`/appraisal-cycles/${cycleId}/status`).send({ status: 'ACTIVE' });
      const closeAttempt = await admin.patch(`/appraisal-cycles/${cycleId}/status`).send({ status: 'CLOSED' });
      expect(closeAttempt.status).toBe(400);
      expect(closeAttempt.body.message).toMatch(/1 appraisal/);

      await asRole(app, 'hse').post(`/appraisals/${second.body.id}/reviews`).send({ rating: 5 });
      await admin.post(`/appraisals/${second.body.id}/reviews`).send({ rating: 5 });

      const closed = await admin.patch(`/appraisal-cycles/${cycleId}/status`).send({ status: 'CLOSED' });
      expect(closed.status).toBe(200);
      expect(closed.body.status).toBe('CLOSED');
    });

    it('rejects any transition once a cycle is CLOSED (terminal)', async () => {
      const res = await admin.patch(`/appraisal-cycles/${cycleId}/status`).send({ status: 'ACTIVE' });
      expect(res.status).toBe(400);
    });
  });
});
