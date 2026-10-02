import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Uses invented, never-elsewhere-used role names for the employee test
// subject (rather than seeded roles like 'finance') so this file can't
// collide with Employee rows other e2e spec files create for those roles'
// users — LocalDevAuthGuard upserts any role name on demand.
describe('Expense Requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;
  let claimantEmployeeId: string;
  let expenseRequestId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');

    const org = await admin.post('/organizations').send({ name: 'ExpenseCo' });
    orgId = org.body.id;

    const claimantUserId = await provisionUser(app, prisma, 'expense-claimant');
    const claimant = await admin.post('/employees').send({
      organizationId: orgId,
      userId: claimantUserId,
      employeeNumber: 'EXP-001',
      jobTitle: 'Field Engineer',
      hireDate: '2024-01-01T00:00:00.000Z',
    });
    claimantEmployeeId = claimant.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects a non-positive amount (400)', async () => {
    const res = await asRole(app, 'expense-claimant').post('/expense-requests/me').send({
      organizationId: orgId,
      category: 'TRAVEL',
      amount: 0,
      incurredOn: '2026-06-01',
    });
    expect(res.status).toBe(400);
  });

  it('a user with no employee record cannot submit a claim (404)', async () => {
    const res = await asRole(app, 'expense-claimant-none').post('/expense-requests/me').send({
      organizationId: orgId,
      category: 'TRAVEL',
      amount: 50,
      incurredOn: '2026-06-01',
    });
    expect(res.status).toBe(404);
  });

  it('submits a claim, starting PENDING', async () => {
    const res = await asRole(app, 'expense-claimant').post('/expense-requests/me').send({
      organizationId: orgId,
      category: 'TRAVEL',
      amount: 125.5,
      incurredOn: '2026-06-01',
      description: 'Client site visit taxi',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.employeeId).toBe(claimantEmployeeId);
    expenseRequestId = res.body.id;
  });

  it("GET /expense-requests/me returns the caller's own claims", async () => {
    const res = await asRole(app, 'expense-claimant').get('/expense-requests/me');
    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === expenseRequestId)).toBe(true);
  });

  it('GET /expense-requests is open to any authenticated user and can filter by employeeId', async () => {
    const res = await asRole(app, 'expense-claimant').get('/expense-requests').query({ employeeId: claimantEmployeeId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /expense-requests/:id includes the employee', async () => {
    const res = await admin.get(`/expense-requests/${expenseRequestId}`);
    expect(res.status).toBe(200);
    expect(res.body.employee.id).toBe(claimantEmployeeId);
  });

  it('a receipt attaches via the ordinary POST /documents, filterable by expenseRequestId', async () => {
    const res = await asRole(app, 'expense-claimant')
      .post('/documents')
      .field('organizationId', orgId)
      .field('expenseRequestId', expenseRequestId)
      .field('title', 'Taxi receipt')
      .attach('file', Buffer.from('receipt'), 'receipt.txt');
    expect(res.status).toBe(201);

    const docs = await admin.get('/documents').query({ expenseRequestId });
    expect(docs.body.some((d: { id: string }) => d.id === res.body.id)).toBe(true);
  });

  it('rejects deciding it from a non-admin/hr role (403)', async () => {
    const res = await asRole(app, 'expense-claimant')
      .patch(`/expense-requests/${expenseRequestId}/status`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  it('rejects an illegal transition straight to REIMBURSED (400)', async () => {
    const res = await admin.patch(`/expense-requests/${expenseRequestId}/status`).send({ status: 'REIMBURSED' });
    expect(res.status).toBe(400);
  });

  it('admin/hr approves the claim', async () => {
    const res = await admin
      .patch(`/expense-requests/${expenseRequestId}/status`)
      .send({ status: 'APPROVED', decisionComment: 'Approved for reimbursement' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.decidedAt).toBeTruthy();
  });

  it('rejects re-approving an already-decided request (400)', async () => {
    const res = await admin.patch(`/expense-requests/${expenseRequestId}/status`).send({ status: 'REJECTED' });
    expect(res.status).toBe(400);
  });

  it('marks the approved claim REIMBURSED', async () => {
    const res = await admin.patch(`/expense-requests/${expenseRequestId}/status`).send({ status: 'REIMBURSED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REIMBURSED');
    expect(res.body.reimbursedAt).toBeTruthy();
  });

  it('REIMBURSED is terminal (400 on any further change)', async () => {
    const res = await admin.patch(`/expense-requests/${expenseRequestId}/status`).send({ status: 'APPROVED' });
    expect(res.status).toBe(400);
  });
});
