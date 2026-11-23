import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import type { EmailNotifier } from '../mail/email-notifier';
import { LeaveService } from './leave.service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asUser = (roleName: string | null, id = `u-${roleName}`) => ({ id, roleName }) as AuthenticatedUser;

// 2026-11-24 is a Tuesday; the store's zone is a day ahead of UTC only after 23:00.
const freezeToday = (now = '2026-11-24T10:00:00.000Z') =>
  jest.useFakeTimers({
    now: new Date(now),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
  });

// A leave request as the service reads it back, with everything it includes.
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'lr-1',
  employeeId: 'e1',
  status: 'PENDING_SUPERVISOR',
  startDate: d('2026-12-01'),
  endDate: d('2026-12-03'),
  returnDate: d('2026-12-04'),
  days: 3,
  leaveType: { id: 't1', name: 'Annual leave', paid: true },
  employee: {
    id: 'e1',
    managerId: 'm1',
    user: {
      id: 'u-eve',
      firstName: 'Eve',
      lastName: 'Worker',
      email: 'eve@acme.test',
      department: { id: 'd1', name: 'Plant', headId: 'u-head', head: { email: 'head@acme.test' } },
    },
    manager: { userId: 'u-mgr', user: { email: 'mgr@acme.test' } },
  },
  approvals: [],
  ...overrides,
});

const employeeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  organizationId: 'org-1',
  managerId: 'm1',
  user: { id: 'u-eve', department: { headId: 'u-head' } },
  ...overrides,
});

const annual = (overrides = {}) => ({ id: 't1', organizationId: 'org-1', name: 'Annual leave', daysPerYear: 21, active: true, allowBackdate: false, ...overrides });
const dto = { leaveTypeId: 't1', startDate: '2026-12-01', endDate: '2026-12-03' };

describe('LeaveService', () => {
  let prisma: MockPrisma;
  let notifier: { leaveAwaiting: jest.Mock; leaveDecided: jest.Mock };
  let service: LeaveService;

  beforeEach(() => {
    freezeToday();
    prisma = createMockPrisma();
    notifier = { leaveAwaiting: jest.fn(), leaveDecided: jest.fn() };
    service = new LeaveService(prisma, notifier as unknown as EmailNotifier);
    prisma.appSetting.findMany.mockResolvedValue([]);
    prisma.department.count.mockResolvedValue(0);
    prisma.employee.count.mockResolvedValue(0);
    prisma.leaveRequest.count.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('access', () => {
    it('tells an ordinary employee they can file and track their own leave, nothing more', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1', organizationId: 'org-1' } as never);

      await expect(service.access(asUser('staff'))).resolves.toEqual({
        employeeId: 'e1',
        organizationId: 'org-1',
        isDepartmentHead: false,
        isSupervisor: false,
        canViewDashboard: false,
        canViewAll: false,
        canManageTypes: false,
        awaitingMyDecision: 0,
      });
    });

    it('treats someone with no role at all as an ordinary employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);

      await expect(service.access(asUser(null))).resolves.toMatchObject({ canViewAll: false, canManageTypes: false });
    });

    it('lets HR and the director see everyone, with only HR managing the types', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      const hr = await service.access(asUser('hr'));
      const director = await service.access(asUser('executive_director'));

      expect(hr).toMatchObject({ employeeId: null, organizationId: null, canViewAll: true, canViewDashboard: true, canManageTypes: true });
      expect(director).toMatchObject({ canViewAll: true, canManageTypes: false });
    });

    it('lets a department head or a supervisor see their people, with how many requests wait on them', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'e9' } as never);
      prisma.department.count.mockResolvedValue(1);
      prisma.employee.count.mockResolvedValue(2);
      prisma.leaveRequest.count.mockResolvedValue(4);

      await expect(service.access(asUser('staff', 'u-head'))).resolves.toMatchObject({
        isDepartmentHead: true,
        isSupervisor: true,
        canViewDashboard: true,
        canViewAll: false,
        awaitingMyDecision: 4,
      });
    });
  });

  describe('filing', () => {
    beforeEach(() => {
      prisma.employee.findUnique.mockResolvedValue(employeeRow() as never);
      prisma.leaveType.findUnique.mockResolvedValue(annual() as never);
      prisma.leaveRequest.findFirst.mockResolvedValue(null);
      prisma.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: 0 } } as never);
      prisma.leaveRequest.create.mockImplementation(((args: { data: object }) => Promise.resolve({ ...row(), ...args.data })) as never);
    });

    it('files the request with its working days and the day they are expected back, and tells the supervisor', async () => {
      const created = await service.create(asUser('staff', 'u-eve'), { ...dto, reason: ' Family wedding ' });

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          employeeId: 'e1',
          leaveTypeId: 't1',
          startDate: d('2026-12-01'),
          endDate: d('2026-12-03'),
          returnDate: d('2026-12-04'),
          days: 3,
          reason: 'Family wedding',
          status: 'PENDING_SUPERVISOR',
        },
        include: expect.any(Object),
      });
      expect(created.status).toBe('PENDING_SUPERVISOR');
      expect(notifier.leaveAwaiting).toHaveBeenCalledWith(
        { employeeName: 'Eve Worker', employeeEmail: 'eve@acme.test', leaveType: 'Annual leave', startDate: d('2026-12-01'), endDate: d('2026-12-03'), returnDate: d('2026-12-04'), days: 3 },
        'SUPERVISOR',
        ['mgr@acme.test', 'head@acme.test'],
      );
    });

    it('counts only working days, and is expected back on the next working day after a weekend', async () => {
      await service.create(asUser('staff', 'u-eve'), { ...dto, startDate: '2026-12-03', endDate: '2026-12-04' });
      await service.create(asUser('staff', 'u-eve'), { ...dto, startDate: '2026-12-03', endDate: '2026-12-06' });

      expect(prisma.leaveRequest.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ days: 2, returnDate: d('2026-12-07') }) }));
      expect(prisma.leaveRequest.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ days: 2, returnDate: d('2026-12-07') }) }));
    });

    it('stores no reason when none is given', async () => {
      await service.create(asUser('staff', 'u-eve'), dto);

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: null }) }));
    });

    it('skips the supervisor step for someone with nobody above them in the department', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRow({ managerId: null, user: { id: 'u-eve', department: null } }) as never);
      await service.create(asUser('staff', 'u-eve'), dto);
      expect(prisma.leaveRequest.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_HR' }) }));

      // Heading the department themselves means no one above to approve.
      prisma.employee.findUnique.mockResolvedValue(employeeRow({ managerId: null, user: { id: 'u-eve', department: { headId: 'u-eve' } } }) as never);
      await service.create(asUser('staff', 'u-eve'), dto);
      expect(prisma.leaveRequest.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_HR' }) }));
    });

    it('still goes to the department head when there is no supervisor', async () => {
      prisma.employee.findUnique.mockResolvedValue(employeeRow({ managerId: null }) as never);

      await service.create(asUser('staff', 'u-eve'), dto);

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_SUPERVISOR' }) }));
    });

    it('needs an employee record', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.create(asUser('staff'), dto)).rejects.toThrow('no employee record');
    });

    it.each([
      [{ startDate: '01/12/2026' }, 'startDate must be a date'],
      [{ endDate: '2026-02-30' }, 'endDate must be a date'],
      [{ startDate: '2026-12-05', endDate: '2026-12-01' }, 'cannot be before the first'],
      [{ startDate: '2026-12-05', endDate: '2026-12-06' }, 'no working days'],
    ])('refuses %j', async (change, message) => {
      await expect(service.create(asUser('staff', 'u-eve'), { ...dto, ...change })).rejects.toThrow(message);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown leave type, one from another organization, and one switched off', async () => {
      prisma.leaveType.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(asUser('staff', 'u-eve'), dto)).rejects.toThrow(NotFoundException);

      prisma.leaveType.findUnique.mockResolvedValueOnce(annual({ organizationId: 'org-2' }) as never);
      await expect(service.create(asUser('staff', 'u-eve'), dto)).rejects.toThrow(NotFoundException);

      prisma.leaveType.findUnique.mockResolvedValueOnce(annual({ active: false }) as never);
      await expect(service.create(asUser('staff', 'u-eve'), dto)).rejects.toThrow('not available to request');
    });

    it('keeps leave from starting in the past, except for types that allow it', async () => {
      const past = { ...dto, startDate: '2026-11-23', endDate: '2026-11-24' };

      await expect(service.create(asUser('staff', 'u-eve'), past)).rejects.toThrow('cannot start in the past');

      prisma.leaveType.findUnique.mockResolvedValue(annual({ allowBackdate: true }) as never);
      await expect(service.create(asUser('staff', 'u-eve'), past)).resolves.toBeDefined();
    });

    it('can start today', async () => {
      await expect(service.create(asUser('staff', 'u-eve'), { ...dto, startDate: '2026-11-24', endDate: '2026-11-25' })).resolves.toBeDefined();
    });

    it('refuses leave that overlaps leave already filed or approved', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValue(row({ startDate: d('2026-12-02'), endDate: d('2026-12-09') }) as never);

      await expect(service.create(asUser('staff', 'u-eve'), dto)).rejects.toThrow('already have leave from 2026-12-02 to 2026-12-09');
      expect(prisma.leaveRequest.findFirst).toHaveBeenCalledWith({
        where: { employeeId: 'e1', status: { in: ['PENDING_SUPERVISOR', 'PENDING_HR', 'PENDING_DIRECTOR', 'APPROVED'] }, startDate: { lte: d('2026-12-03') }, endDate: { gte: d('2026-12-01') } },
      });
    });

    it('refuses more days than are left of the year’s allowance, saying how many are', async () => {
      prisma.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: 19 } } as never);

      await expect(service.create(asUser('staff', 'u-eve'), dto)).rejects.toThrow('only have 2 of Annual leave left for 2026');
      expect(prisma.leaveRequest.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ employeeId: 'e1', leaveTypeId: 't1', status: { in: expect.arrayContaining(['APPROVED', 'PENDING_HR']) } }) }),
      );
    });

    it('allows exactly what is left, and never says a negative number is left', async () => {
      prisma.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: 18 } } as never);
      await expect(service.create(asUser('staff', 'u-eve'), dto)).resolves.toBeDefined();

      prisma.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: 25 } } as never);
      await expect(service.create(asUser('staff', 'u-eve'), dto)).rejects.toThrow('only have 0 of');
    });

    it('does not check an allowance for a type with no limit', async () => {
      prisma.leaveType.findUnique.mockResolvedValue(annual({ name: 'Unpaid leave', daysPerYear: null }) as never);

      await expect(service.create(asUser('staff', 'u-eve'), dto)).resolves.toBeDefined();
      expect(prisma.leaveRequest.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    beforeEach(() => {
      prisma.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    });

    it('lets the requester withdraw a request that is still waiting', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);

      await service.cancel('lr-1', asUser('staff', 'u-eve'));

      expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'lr-1', status: 'PENDING_SUPERVISOR' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelledById: 'u-eve' },
      });
    });

    it('lets the requester cancel approved leave that has not started', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'APPROVED' }) as never);

      await expect(service.cancel('lr-1', asUser('staff', 'u-eve'))).resolves.toBeDefined();
    });

    it('leaves leave that has started to HR', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'APPROVED', startDate: d('2026-11-24') }) as never);

      await expect(service.cancel('lr-1', asUser('staff', 'u-eve'))).rejects.toThrow('only be cancelled by HR');
      await expect(service.cancel('lr-1', asUser('hr'))).resolves.toBeDefined();
      await expect(service.cancel('lr-1', asUser('admin'))).resolves.toBeDefined();
    });

    it('is for the requester or HR only', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);

      await expect(service.cancel('lr-1', asUser('staff', 'u-other'))).rejects.toThrow(ForbiddenException);
      await expect(service.cancel('lr-1', asUser('executive_director'))).rejects.toThrow(ForbiddenException);
    });

    it('refuses what is already over, and what changed while it was being cancelled', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'REJECTED' }) as never);
      await expect(service.cancel('lr-1', asUser('staff', 'u-eve'))).rejects.toThrow('already rejected');
      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'CANCELLED' }) as never);
      await expect(service.cancel('lr-1', asUser('staff', 'u-eve'))).rejects.toThrow('already cancelled');

      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);
      prisma.leaveRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.cancel('lr-1', asUser('staff', 'u-eve'))).rejects.toThrow(ConflictException);
    });

    it('404s for an unknown request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(null);

      await expect(service.cancel('nope', asUser('hr'))).rejects.toThrow(NotFoundException);
    });
  });

  describe('deciding', () => {
    const move = (before: object, after: object) => {
      prisma.leaveRequest.findUnique.mockResolvedValueOnce(before as never).mockResolvedValueOnce(after as never);
      prisma.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.leaveApproval.create.mockResolvedValue({} as never);
    };

    it('lets the supervisor approve, sending it to HR and telling HR', async () => {
      move(row(), row({ status: 'PENDING_HR' }));

      const result = await service.decide('lr-1', asUser('staff', 'u-mgr'), { decision: 'APPROVE', comment: ' Fine ' });

      expect(result.status).toBe('PENDING_HR');
      expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'lr-1', status: 'PENDING_SUPERVISOR' }, data: { status: 'PENDING_HR' } });
      expect(prisma.leaveApproval.create).toHaveBeenCalledWith({
        data: { requestId: 'lr-1', stage: 'SUPERVISOR', decision: 'APPROVED', deciderId: 'u-mgr', comment: 'Fine' },
      });
      expect(notifier.leaveAwaiting).toHaveBeenCalledWith(expect.objectContaining({ employeeName: 'Eve Worker' }), 'HR', ['mgr@acme.test', 'head@acme.test']);
      expect(notifier.leaveDecided).not.toHaveBeenCalled();
    });

    it('lets the department head do the first step too', async () => {
      move(row(), row({ status: 'PENDING_HR' }));

      await expect(service.decide('lr-1', asUser('staff', 'u-head'), { decision: 'APPROVE' })).resolves.toBeDefined();
      expect(prisma.leaveApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stage: 'SUPERVISOR', comment: null }) });
    });

    it('lets HR approve the second step, sending it to the executive director', async () => {
      move(row({ status: 'PENDING_HR' }), row({ status: 'PENDING_DIRECTOR' }));

      await service.decide('lr-1', asUser('hr'), { decision: 'APPROVE' });

      expect(prisma.leaveApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stage: 'HR', decision: 'APPROVED' }) });
      expect(notifier.leaveAwaiting).toHaveBeenCalledWith(expect.any(Object), 'DIRECTOR', expect.any(Array));
    });

    it('lets the executive director confirm it, and tells the requester', async () => {
      move(row({ status: 'PENDING_DIRECTOR' }), row({ status: 'APPROVED' }));

      const result = await service.decide('lr-1', asUser('executive_director'), { decision: 'APPROVE', comment: 'Enjoy' });

      expect(result.status).toBe('APPROVED');
      expect(prisma.leaveApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stage: 'DIRECTOR' }) });
      expect(notifier.leaveDecided).toHaveBeenCalledWith(expect.objectContaining({ employeeEmail: 'eve@acme.test' }), { approved: true, stage: 'executive director', comment: 'Enjoy' });
      expect(notifier.leaveAwaiting).not.toHaveBeenCalled();
    });

    it('lets admin step in at any stage', async () => {
      move(row({ status: 'PENDING_HR' }), row({ status: 'PENDING_DIRECTOR' }));

      await expect(service.decide('lr-1', asUser('admin'), { decision: 'APPROVE' })).resolves.toBeDefined();
    });

    it('ends the request when anyone declines, with their reason, and tells the requester', async () => {
      move(row({ status: 'PENDING_HR' }), row({ status: 'REJECTED' }));

      await service.decide('lr-1', asUser('hr'), { decision: 'REJECT', comment: ' Not during shutdown ' });

      expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'lr-1', status: 'PENDING_HR' }, data: { status: 'REJECTED' } });
      expect(prisma.leaveApproval.create).toHaveBeenCalledWith({
        data: { requestId: 'lr-1', stage: 'HR', decision: 'REJECTED', deciderId: 'u-hr', comment: 'Not during shutdown' },
      });
      expect(notifier.leaveDecided).toHaveBeenCalledWith(expect.any(Object), { approved: false, stage: 'HR', comment: 'Not during shutdown' });
    });

    it('wants a reason for declining', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);

      await expect(service.decide('lr-1', asUser('staff', 'u-mgr'), { decision: 'REJECT', comment: '  ' })).rejects.toThrow('say why');
      expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an unknown decision', async () => {
      await expect(service.decide('lr-1', asUser('hr'), { decision: 'MAYBE' })).rejects.toThrow('APPROVE or REJECT');
    });

    it('refuses a request that is already finished', async () => {
      for (const status of ['APPROVED', 'REJECTED', 'CANCELLED']) {
        prisma.leaveRequest.findUnique.mockResolvedValueOnce(row({ status }) as never);
        await expect(service.decide('lr-1', asUser('hr'), { decision: 'APPROVE' })).rejects.toThrow(`already ${status.toLowerCase()}`);
      }
    });

    it('never lets anyone decide their own request, not even admin', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'PENDING_HR' }) as never);

      await expect(service.decide('lr-1', asUser('hr', 'u-eve'), { decision: 'APPROVE' })).rejects.toThrow('cannot decide your own');
      await expect(service.decide('lr-1', asUser('admin', 'u-eve'), { decision: 'APPROVE' })).rejects.toThrow(ForbiddenException);
    });

    it('is for whoever the request is waiting on, and nobody else', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);
      await expect(service.decide('lr-1', asUser('hr'), { decision: 'APPROVE' })).rejects.toThrow('waiting for the supervisor');
      await expect(service.decide('lr-1', asUser('staff', 'u-other'), { decision: 'APPROVE' })).rejects.toThrow(ForbiddenException);

      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'PENDING_HR' }) as never);
      await expect(service.decide('lr-1', asUser('executive_director'), { decision: 'APPROVE' })).rejects.toThrow('waiting for the HR');
      await expect(service.decide('lr-1', asUser('staff', 'u-mgr'), { decision: 'APPROVE' })).rejects.toThrow(ForbiddenException);

      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'PENDING_DIRECTOR' }) as never);
      await expect(service.decide('lr-1', asUser('hr'), { decision: 'APPROVE' })).rejects.toThrow('waiting for the executive director');
    });

    it('cannot be approved by a department head with no one set, or a request with no supervisor', async () => {
      const bare = row({ employee: { ...row().employee, manager: null, user: { ...row().employee.user, department: null } } });
      prisma.leaveRequest.findUnique.mockResolvedValue(bare as never);

      await expect(service.decide('lr-1', asUser('staff', 'u-head'), { decision: 'APPROVE' })).rejects.toThrow(ForbiddenException);
    });

    it('does not double-count when someone else decided first', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);
      prisma.leaveRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.decide('lr-1', asUser('staff', 'u-mgr'), { decision: 'APPROVE' })).rejects.toThrow(ConflictException);
      expect(prisma.leaveApproval.create).not.toHaveBeenCalled();
    });

    it('only the supervisor, with nobody else listed, is told about the first step when there is no department head', async () => {
      const noHead = row({ employee: { ...row().employee, user: { ...row().employee.user, department: { id: 'd1', name: 'Plant', headId: null, head: null } } } });
      move(noHead, { ...noHead, status: 'PENDING_HR' });

      await service.decide('lr-1', asUser('staff', 'u-mgr'), { decision: 'APPROVE' });

      expect(notifier.leaveAwaiting).toHaveBeenCalledWith(expect.any(Object), 'HR', ['mgr@acme.test']);
    });

    it('names the person by email when they have no name, and has no one to tell for a first step with nobody above', async () => {
      const nameless = row({
        status: 'PENDING_SUPERVISOR',
        employee: { ...row().employee, manager: null, user: { ...row().employee.user, firstName: '', lastName: '', department: null } },
      });
      prisma.employee.findUnique.mockResolvedValue(employeeRow() as never);
      prisma.leaveType.findUnique.mockResolvedValue(annual() as never);
      prisma.leaveRequest.findFirst.mockResolvedValue(null);
      prisma.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: null } } as never);
      prisma.leaveRequest.create.mockResolvedValue(nameless as never);

      await service.create(asUser('staff', 'u-eve'), dto);

      expect(notifier.leaveAwaiting).toHaveBeenCalledWith(expect.objectContaining({ employeeName: 'eve@acme.test' }), 'SUPERVISOR', []);
    });
  });

  describe('lists', () => {
    beforeEach(() => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
    });

    it('mine: the requester’s own, newest first, optionally by status', async () => {
      await service.mine(asUser('staff', 'u-eve'), { status: 'APPROVED' });
      await service.mine(asUser('staff', 'u-eve'), {});

      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { employee: { userId: 'u-eve' }, status: 'APPROVED' }, orderBy: { startDate: 'desc' } }));
      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { employee: { userId: 'u-eve' }, status: undefined } }));
      expect(() => service.mine(asUser('staff'), { status: 'NOPE' })).toThrow('status must be one of');
    });

    describe('inbox', () => {
      const whereOf = () => (prisma.leaveRequest.findMany.mock.calls.at(-1)![0] as { where: unknown }).where;

      it('is everything pending for admin, except their own', async () => {
        prisma.employee.findUnique.mockResolvedValue(null);

        await service.inbox(asUser('admin', 'u-admin'));

        expect(whereOf()).toEqual({ OR: [{ status: { in: ['PENDING_SUPERVISOR', 'PENDING_HR', 'PENDING_DIRECTOR'] } }], employee: { userId: { not: 'u-admin' } } });
      });

      it('is the second step for HR and the last for the director, plus first steps they supervise', async () => {
        prisma.employee.findUnique.mockResolvedValue({ id: 'e-hr' } as never);

        await service.inbox(asUser('hr', 'u-hr'));
        expect(whereOf()).toEqual({
          OR: [
            { status: 'PENDING_HR' },
            { status: 'PENDING_SUPERVISOR', employee: { OR: [{ user: { department: { headId: 'u-hr' } } }, { managerId: 'e-hr' }] } },
          ],
          employee: { userId: { not: 'u-hr' } },
        });

        prisma.employee.findUnique.mockResolvedValue(null);
        await service.inbox(asUser('executive_director', 'u-ed'));
        expect(whereOf()).toEqual({
          OR: [{ status: 'PENDING_DIRECTOR' }, { status: 'PENDING_SUPERVISOR', employee: { OR: [{ user: { department: { headId: 'u-ed' } } }] } }],
          employee: { userId: { not: 'u-ed' } },
        });
      });
    });

    describe('everyone’s requests', () => {
      it('are all of them for HR, filtered however asked', async () => {
        await service.findAll(asUser('hr'), { status: 'APPROVED', employeeId: 'e1', departmentId: 'd1', from: '2026-12-01', to: '2026-12-31' });
        await service.findAll(asUser('executive_director'), {});

        expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            where: {
              AND: [
                {},
                { status: 'APPROVED', employeeId: 'e1' },
                { employee: { user: { departmentId: 'd1' } } },
                { startDate: { lte: d('2026-12-31') } },
                { endDate: { gte: d('2026-12-01') } },
              ],
            },
          }),
        );
        expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { AND: [{}, { status: undefined, employeeId: undefined }, {}, {}, {}] } }));
      });

      it('are the department’s and team’s for a head or supervisor', async () => {
        prisma.employee.findUnique.mockResolvedValue({ id: 'e-sup' } as never);
        prisma.department.count.mockResolvedValue(1);
        prisma.employee.count.mockResolvedValue(3);

        await service.findAll(asUser('staff', 'u-head'), {});

        expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { AND: [{ employee: { OR: [{ user: { department: { headId: 'u-head' } } }, { managerId: 'e-sup' }] } }, expect.any(Object), {}, {}, {}] },
          }),
        );
      });

      it('are closed to everyone else, and reject a bad status or date', async () => {
        prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);

        await expect(service.findAll(asUser('staff'), {})).rejects.toThrow(ForbiddenException);
        await expect(service.findAll(asUser('hr'), { status: 'NOPE' })).rejects.toThrow('status must be one of');
        await expect(service.findAll(asUser('hr'), { from: 'soon' })).rejects.toThrow('from must be a date');
        await expect(service.findAll(asUser('hr'), { to: 'soon' })).rejects.toThrow('to must be a date');
      });
    });
  });

  describe('one request', () => {
    it('is visible to its owner, the person it is waiting on, HR and the director', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row() as never);
      await expect(service.findOne('lr-1', asUser('staff', 'u-eve'))).resolves.toBeDefined();
      await expect(service.findOne('lr-1', asUser('staff', 'u-mgr'))).resolves.toBeDefined();
      await expect(service.findOne('lr-1', asUser('hr'))).resolves.toBeDefined();
      await expect(service.findOne('lr-1', asUser('executive_director'))).resolves.toBeDefined();
    });

    it('is visible to a head or supervisor of the person once it has moved on, but not to others', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(row({ status: 'APPROVED' }) as never);
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.department.count.mockResolvedValue(1);
      prisma.employee.count.mockResolvedValue(1);
      await expect(service.findOne('lr-1', asUser('staff', 'u-head'))).resolves.toBeDefined();

      prisma.employee.count.mockResolvedValue(0);
      await expect(service.findOne('lr-1', asUser('staff', 'u-head'))).rejects.toThrow('cannot see this leave request');

      prisma.department.count.mockResolvedValue(0);
      await expect(service.findOne('lr-1', asUser('staff', 'u-other'))).rejects.toThrow(ForbiddenException);
    });

    it('404s for an unknown id', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nope', asUser('hr'))).rejects.toThrow(NotFoundException);
    });
  });

  describe('balance', () => {
    beforeEach(() => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1', organizationId: 'org-1' } as never);
      prisma.leaveType.findMany.mockResolvedValue([
        { id: 't1', name: 'Annual leave', paid: true, daysPerYear: 21 },
        { id: 't2', name: 'Unpaid leave', paid: false, daysPerYear: null },
        { id: 't3', name: 'Sick leave', paid: true, daysPerYear: 10 },
      ] as never);
      prisma.leaveRequest.aggregate
        .mockResolvedValueOnce({ _sum: { days: 5 } } as never) // t1 approved
        .mockResolvedValueOnce({ _sum: { days: 3 } } as never) // t1 pending
        .mockResolvedValueOnce({ _sum: { days: 2 } } as never) // t2 approved
        .mockResolvedValueOnce({ _sum: { days: null } } as never) // t2 pending
        .mockResolvedValueOnce({ _sum: { days: 9 } } as never) // t3 approved
        .mockResolvedValueOnce({ _sum: { days: 4 } } as never); // t3 pending (over)
    });

    it('shows the allowance, what is taken, what is waiting and what is left, per type', async () => {
      const result = await service.balance(asUser('staff', 'u-eve'), {});

      expect(result).toEqual({
        employeeId: 'e1',
        year: 2026,
        balances: [
          { leaveTypeId: 't1', name: 'Annual leave', paid: true, entitlement: 21, used: 5, pending: 3, remaining: 13 },
          { leaveTypeId: 't2', name: 'Unpaid leave', paid: false, entitlement: null, used: 2, pending: 0, remaining: null },
          { leaveTypeId: 't3', name: 'Sick leave', paid: true, entitlement: 10, used: 9, pending: 4, remaining: 0 },
        ],
      });
      expect(prisma.leaveRequest.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ startDate: { gte: d('2026-01-01'), lte: d('2026-12-31') } }) }),
      );
    });

    it('can be for another year', async () => {
      const result = await service.balance(asUser('staff', 'u-eve'), { year: '2027' });

      expect(result.year).toBe(2027);
    });

    it('lets HR see anyone’s, and a head or supervisor see their people’s, but not others’', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({ id: 'e-hr' } as never).mockResolvedValue({ id: 'e1', organizationId: 'org-1' } as never);
      await expect(service.balance(asUser('hr'), { employeeId: 'e1' })).resolves.toMatchObject({ employeeId: 'e1' });

      prisma.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: 0 } } as never);
      prisma.employee.findUnique.mockReset();
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1', organizationId: 'org-1' } as never);
      prisma.department.count.mockResolvedValue(1);
      prisma.employee.count.mockResolvedValue(1);
      await expect(service.balance(asUser('staff', 'u-head'), { employeeId: 'e2' })).resolves.toBeDefined();

      prisma.employee.count.mockResolvedValue(0);
      await expect(service.balance(asUser('staff', 'u-head'), { employeeId: 'e2' })).rejects.toThrow('cannot see that person');
    });

    it('needs an employee record and a real year', async () => {
      prisma.employee.findUnique.mockReset();
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.balance(asUser('staff'), {})).rejects.toThrow('no employee record');

      prisma.employee.findUnique.mockResolvedValueOnce({ id: 'e1' } as never).mockResolvedValueOnce(null);
      await expect(service.balance(asUser('hr'), { employeeId: 'e9' })).rejects.toThrow(NotFoundException);

      prisma.employee.findUnique.mockReset();
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1', organizationId: 'org-1' } as never);
      await expect(service.balance(asUser('staff'), { year: '26' })).rejects.toThrow('year must look like 2026');
      await expect(service.balance(asUser('staff'), { year: 'abc' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('who is on leave', () => {
    const away = (returnDate: string) => row({ status: 'APPROVED', returnDate: d(returnDate) });

    beforeEach(() => {
      prisma.leaveRequest.findMany.mockResolvedValueOnce([away('2026-11-26'), away('2026-12-20')] as never).mockResolvedValueOnce([row({ status: 'APPROVED' })] as never);
      prisma.leaveRequest.count.mockResolvedValue(6);
    });

    it('lists who is away today, who goes soon, and the numbers, for HR', async () => {
      const result = await service.onLeave(asUser('hr'), {});

      expect(result.asOf).toBe('2026-11-24');
      expect(result.onLeave).toHaveLength(2);
      expect(result.upcoming).toHaveLength(1);
      expect(result.counts).toEqual({ onLeave: 2, returningThisWeek: 1, startingSoon: 1, awaitingApproval: 6 });
      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { AND: [{}, {}, { status: 'APPROVED', startDate: { lte: d('2026-11-24') }, endDate: { gte: d('2026-11-24') } }] }, orderBy: { returnDate: 'asc' } }),
      );
      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { AND: [{}, {}, { status: 'APPROVED', startDate: { gt: d('2026-11-24'), lte: d('2026-12-24') } }] }, orderBy: { startDate: 'asc' } }),
      );
    });

    it('can be for another day and one department', async () => {
      await service.onLeave(asUser('executive_director'), { date: '2026-12-01', departmentId: 'd1' });

      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { AND: [{}, { employee: { user: { departmentId: 'd1' } } }, expect.objectContaining({ startDate: { lte: d('2026-12-01') } })] } }),
      );
    });

    it('shows a department head only their department’s people', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.department.count.mockResolvedValue(1);

      await service.onLeave(asUser('staff', 'u-head'), { date: '' });

      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { AND: [{ employee: { OR: [{ user: { department: { headId: 'u-head' } } }] } }, {}, expect.any(Object)] } }),
      );
    });

    it('is closed to everyone else, and rejects a bad date', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);
      await expect(service.onLeave(asUser('staff'), {})).rejects.toThrow('Only the executive director, HR, department heads and supervisors');
      await expect(service.onLeave(asUser('hr'), { date: 'tomorrow' })).rejects.toThrow('date must be a date');
    });
  });
});
