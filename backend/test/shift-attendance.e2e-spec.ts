import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { asRole, provisionUser } from './utils/auth';
import { createTestApp } from './utils/test-app';

// Uses invented, never-elsewhere-used role names for the employee test
// subjects (rather than the seeded roles like 'finance'/'hse') so this file
// can't collide with the Employee rows other e2e spec files create for
// those roles' users — LocalDevAuthGuard upserts any role name on demand.
describe('Shift & Attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;
  let shiftId: string;
  let empWithShiftId: string;
  let empNoShiftId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    admin = asRole(app, 'admin');

    const org = await admin.post('/organizations').send({ name: 'ShiftCo' });
    orgId = org.body.id;

    const userWithShift = await provisionUser(app, prisma, 'shift-emp-1');
    const userNoShift = await provisionUser(app, prisma, 'shift-emp-2');

    const empWithShift = await admin.post('/employees').send({
      organizationId: orgId,
      userId: userWithShift,
      employeeNumber: 'SHIFT-001',
      jobTitle: 'Analyst',
      hireDate: '2024-01-01T00:00:00.000Z',
    });
    empWithShiftId = empWithShift.body.id;

    const empNoShift = await admin.post('/employees').send({
      organizationId: orgId,
      userId: userNoShift,
      employeeNumber: 'SHIFT-002',
      jobTitle: 'Analyst',
      hireDate: '2024-01-01T00:00:00.000Z',
    });
    empNoShiftId = empNoShift.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('shifts', () => {
    it('creates a shift', async () => {
      const res = await admin.post('/shifts').send({
        organizationId: orgId,
        name: 'Morning',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 30,
      });
      expect(res.status).toBe(201);
      shiftId = res.body.id;
    });

    it('rejects a duplicate shift name in the same organization (409)', async () => {
      const res = await admin.post('/shifts').send({
        organizationId: orgId,
        name: 'Morning',
        startTime: '10:00',
        endTime: '18:00',
      });
      expect(res.status).toBe(409);
    });

    it('rejects shift creation from a non-admin/hr role (403)', async () => {
      const res = await asRole(app, 'shift-emp-1').post('/shifts').send({
        organizationId: orgId,
        name: 'Evening',
        startTime: '17:00',
        endTime: '23:00',
      });
      expect(res.status).toBe(403);
    });

    it('lists shifts scoped by organizationId', async () => {
      const res = await admin.get('/shifts').query({ organizationId: orgId });
      expect(res.status).toBe(200);
      expect(res.body.some((s: { id: string }) => s.id === shiftId)).toBe(true);
    });

    it('updates a shift', async () => {
      const res = await admin.patch(`/shifts/${shiftId}`).send({ breakMinutes: 45 });
      expect(res.status).toBe(200);
      expect(res.body.breakMinutes).toBe(45);
    });

    it('404s updating an unknown shift', async () => {
      const res = await admin.patch('/shifts/00000000-0000-0000-0000-000000000000').send({ breakMinutes: 10 });
      expect(res.status).toBe(404);
    });

    it('assigns the shift to an employee via PATCH /employees/:id', async () => {
      const res = await admin.patch(`/employees/${empWithShiftId}`).send({ shiftId });
      expect(res.status).toBe(200);
      expect(res.body.shiftId).toBe(shiftId);
    });
  });

  describe('attendance', () => {
    it('clocking out before clocking in is rejected (400)', async () => {
      const res = await asRole(app, 'shift-emp-2').post('/attendance/clock-out');
      expect(res.status).toBe(400);
    });

    it('an employee can clock in for today', async () => {
      const res = await asRole(app, 'shift-emp-2').post('/attendance/clock-in');
      expect(res.status).toBe(201);
      expect(res.body.employeeId).toBe(empNoShiftId);
      expect(res.body.clockIn).toBeTruthy();
      expect(res.body.status).toBe('PRESENT');
    });

    it('clocking in twice in the same day is rejected (409)', async () => {
      const res = await asRole(app, 'shift-emp-2').post('/attendance/clock-in');
      expect(res.status).toBe(409);
    });

    it("GET /attendance/me returns the caller's own record", async () => {
      const res = await asRole(app, 'shift-emp-2').get('/attendance/me');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].employeeId).toBe(empNoShiftId);
    });

    it('an employee can clock out', async () => {
      const res = await asRole(app, 'shift-emp-2').post('/attendance/clock-out');
      expect(res.status).toBe(201);
      expect(res.body.clockOut).toBeTruthy();
    });

    it('clocking out twice is rejected (409)', async () => {
      const res = await asRole(app, 'shift-emp-2').post('/attendance/clock-out');
      expect(res.status).toBe(409);
    });

    it('a user with no employee record cannot clock in (404)', async () => {
      const res = await asRole(app, 'shift-emp-3').post('/attendance/clock-in');
      expect(res.status).toBe(404);
    });

    it('admin/hr can manually create a record for a past date', async () => {
      const res = await admin.post('/attendance').send({
        employeeId: empWithShiftId,
        date: '2026-01-05',
        status: 'ON_LEAVE',
        notes: 'Approved vacation',
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ON_LEAVE');
    });

    it('rejects a duplicate manual record for the same employee/day (409)', async () => {
      const res = await admin.post('/attendance').send({
        employeeId: empWithShiftId,
        date: '2026-01-05',
        status: 'HOLIDAY',
      });
      expect(res.status).toBe(409);
    });

    it('admin/hr corrects an existing record', async () => {
      const created = await admin.post('/attendance').send({
        employeeId: empWithShiftId,
        date: '2026-01-06',
        status: 'ABSENT',
      });
      const res = await admin
        .patch(`/attendance/${created.body.id}`)
        .send({ status: 'HALF_DAY', notes: 'Left early' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('HALF_DAY');
    });

    it('404s correcting an unknown record', async () => {
      const res = await admin.patch('/attendance/00000000-0000-0000-0000-000000000000').send({ status: 'PRESENT' });
      expect(res.status).toBe(404);
    });

    it('rejects listing all attendance from a non-admin/hr role (403)', async () => {
      const res = await asRole(app, 'shift-emp-2').get('/attendance');
      expect(res.status).toBe(403);
    });

    it('admin/hr lists attendance filtered by employee', async () => {
      const res = await admin.get('/attendance').query({ employeeId: empNoShiftId });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].employee.id).toBe(empNoShiftId);
    });
  });
});
