import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStage, LeaveStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { getSchedule, isValidDateString, nowIn } from '../appointments/appointment-schedule';
import { EmailNotifier } from '../mail/email-notifier';
import { addDays, dayString } from '../maintenance/schedules/schedule-dates';
import { CreateLeaveRequestDto, LeaveDecisionDto } from './dto/leave.dto';
import { nextWorkingDay, workingDaysBetween } from './leave-dates';

// Roles that see everyone's leave and take the HR / director steps.
const HR_ROLE = 'hr';
const DIRECTOR_ROLE = 'executive_director';
const ADMIN_ROLE = 'admin';

const PENDING: LeaveStatus[] = ['PENDING_SUPERVISOR', 'PENDING_HR', 'PENDING_DIRECTOR'];
const STILL_COUNTS: LeaveStatus[] = [...PENDING, 'APPROVED'];
const STATUSES: LeaveStatus[] = [...PENDING, 'APPROVED', 'REJECTED', 'CANCELLED'];

const STAGE_OF: Partial<Record<LeaveStatus, LeaveStage>> = {
  PENDING_SUPERVISOR: 'SUPERVISOR',
  PENDING_HR: 'HR',
  PENDING_DIRECTOR: 'DIRECTOR',
};
// Where an approval at each step sends the request next.
const AFTER_APPROVAL: Record<LeaveStage, LeaveStatus> = {
  SUPERVISOR: 'PENDING_HR',
  HR: 'PENDING_DIRECTOR',
  DIRECTOR: 'APPROVED',
};
const STAGE_NAME: Record<LeaveStage, string> = { SUPERVISOR: 'supervisor', HR: 'HR', DIRECTOR: 'executive director' };

const UPCOMING_DAYS = 30;
const RETURNING_SOON_DAYS = 7;

const PERSON = { select: { id: true, firstName: true, lastName: true, email: true, departmentId: true } } as const;
const INCLUDE = {
  leaveType: { select: { id: true, name: true, paid: true } },
  employee: {
    select: {
      id: true,
      employeeNumber: true,
      jobTitle: true,
      managerId: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, department: { select: { id: true, name: true, headId: true, head: { select: { email: true } } } } } },
      manager: { select: { userId: true, user: { select: { email: true } } } },
    },
  },
  approvals: {
    orderBy: { decidedAt: 'asc' as const },
    include: { decider: { select: { id: true, firstName: true, lastName: true, email: true } } },
  },
} as const;
type LeaveRow = Prisma.LeaveRequestGetPayload<{ include: typeof INCLUDE }>;

const dayOf = (value: string, field: string) => {
  if (!isValidDateString(value)) throw new BadRequestException(`${field} must be a date like 2026-10-24`);
  return new Date(`${value}T00:00:00.000Z`);
};

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: EmailNotifier,
  ) {}

  // What this person can see and do on the Leave page.
  async access(user: AuthenticatedUser) {
    const employee = await this.employeeOf(user);
    const [headed, reports, inbox] = await Promise.all([
      this.prisma.department.count({ where: { headId: user.id } }),
      employee ? this.prisma.employee.count({ where: { managerId: employee.id } }) : 0,
      this.prisma.leaveRequest.count({ where: this.awaitingWhere(user, employee?.id) }),
    ]);
    const seesAll = this.seesAll(user);
    return {
      employeeId: employee?.id ?? null,
      organizationId: employee?.organizationId ?? null,
      isDepartmentHead: headed > 0,
      isSupervisor: reports > 0,
      canViewDashboard: seesAll || headed > 0 || reports > 0,
      canViewAll: seesAll,
      canManageTypes: this.isHr(user),
      awaitingMyDecision: inbox,
    };
  }

  // --- filing ------------------------------------------------------------------

  async create(user: AuthenticatedUser, dto: CreateLeaveRequestDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: user.id },
      include: { user: { include: { department: true } } },
    });
    if (!employee) {
      throw new NotFoundException('You have no employee record yet. Ask HR to add you before filing leave');
    }
    const start = dayOf(dto.startDate, 'startDate');
    const end = dayOf(dto.endDate, 'endDate');
    if (end < start) throw new BadRequestException('The last day of leave cannot be before the first');

    const type = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!type || type.organizationId !== employee.organizationId) {
      throw new NotFoundException(`Leave type ${dto.leaveTypeId} not found`);
    }
    if (!type.active) throw new BadRequestException(`${type.name} is not available to request`);

    const schedule = await getSchedule(this.prisma);
    const today = nowIn(schedule.timeZone).date;
    if (dto.startDate < today && !type.allowBackdate) {
      throw new BadRequestException(`${type.name} cannot start in the past`);
    }
    const days = workingDaysBetween(start, end, schedule.workingDays);
    if (days === 0) throw new BadRequestException('Those dates have no working days in them');

    const clash = await this.prisma.leaveRequest.findFirst({
      where: { employeeId: employee.id, status: { in: STILL_COUNTS }, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (clash) {
      throw new ConflictException(`You already have leave from ${dayString(clash.startDate)} to ${dayString(clash.endDate)}`);
    }

    if (type.daysPerYear !== null) {
      const taken = await this.daysTaken(employee.id, type.id, start.getUTCFullYear(), STILL_COUNTS);
      if (taken + days > type.daysPerYear) {
        const left = Math.max(0, type.daysPerYear - taken);
        throw new BadRequestException(`That is ${days} working days but you only have ${left} of ${type.name} left for ${start.getUTCFullYear()}`);
      }
    }

    // Someone above them in the department, or the first step is skipped.
    const headId = employee.user.department?.headId;
    const hasSupervisor = !!employee.managerId || (!!headId && headId !== user.id);

    const created = await this.prisma.leaveRequest.create({
      data: {
        organizationId: employee.organizationId,
        employeeId: employee.id,
        leaveTypeId: type.id,
        startDate: start,
        endDate: end,
        returnDate: nextWorkingDay(end, schedule.workingDays),
        days,
        reason: dto.reason?.trim() || null,
        status: hasSupervisor ? 'PENDING_SUPERVISOR' : 'PENDING_HR',
      },
      include: INCLUDE,
    });
    void this.notifyNext(created, STAGE_OF[created.status]!);
    return created;
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const request = await this.findOneOrThrow(id);
    const owner = request.employee.user.id === user.id;
    const manager = this.isHr(user) || user.roleName === ADMIN_ROLE;
    if (!owner && !manager) throw new ForbiddenException('You can only cancel your own leave');
    if (request.status === 'REJECTED' || request.status === 'CANCELLED') {
      throw new BadRequestException(`This request is already ${request.status.toLowerCase()}`);
    }
    if (request.status === 'APPROVED' && !manager) {
      const today = await this.today();
      if (dayString(request.startDate) <= today) {
        throw new BadRequestException('Leave that has already started can only be cancelled by HR');
      }
    }
    const result = await this.prisma.leaveRequest.updateMany({
      where: { id, status: request.status },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.id },
    });
    if (result.count === 0) throw new ConflictException('This request was just changed by someone else. Reload and try again');
    return this.findOneOrThrow(id);
  }

  // --- deciding ----------------------------------------------------------------

  async decide(id: string, user: AuthenticatedUser, dto: LeaveDecisionDto) {
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw new BadRequestException('decision must be APPROVE or REJECT');
    }
    const request = await this.findOneOrThrow(id);
    const stage = STAGE_OF[request.status];
    if (!stage) throw new BadRequestException(`This request is already ${request.status.toLowerCase()}`);
    if (request.employee.user.id === user.id) {
      throw new ForbiddenException('You cannot decide your own leave request');
    }
    if (!this.mayDecide(user, request, stage)) {
      throw new ForbiddenException(`It is waiting for the ${STAGE_NAME[stage]}, and that is not you`);
    }
    const comment = dto.comment?.trim() || null;
    if (dto.decision === 'REJECT' && !comment) {
      throw new BadRequestException('Please say why the request is being declined');
    }

    const next: LeaveStatus = dto.decision === 'REJECT' ? 'REJECTED' : AFTER_APPROVAL[stage];
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.leaveRequest.updateMany({ where: { id, status: request.status }, data: { status: next } });
      if (moved.count === 0) {
        throw new ConflictException('This request was just decided by someone else. Reload and try again');
      }
      await tx.leaveApproval.create({
        data: { requestId: id, stage, decision: dto.decision === 'REJECT' ? 'REJECTED' : 'APPROVED', deciderId: user.id, comment },
      });
    });

    const updated = await this.findOneOrThrow(id);
    if (next === 'APPROVED' || next === 'REJECTED') {
      void this.notifier.leaveDecided(this.mailOf(updated), { approved: next === 'APPROVED', stage: STAGE_NAME[stage], comment });
    } else {
      void this.notifyNext(updated, STAGE_OF[next]!);
    }
    return updated;
  }

  // --- reading -----------------------------------------------------------------

  mine(user: AuthenticatedUser, filters: { status?: string }) {
    this.assertStatus(filters.status);
    return this.prisma.leaveRequest.findMany({
      where: { employee: { userId: user.id }, status: filters.status as LeaveStatus | undefined },
      include: INCLUDE,
      orderBy: { startDate: 'desc' },
    });
  }

  // What is waiting for this person's decision, oldest first.
  async inbox(user: AuthenticatedUser) {
    const employee = await this.employeeOf(user);
    return this.prisma.leaveRequest.findMany({
      where: this.awaitingWhere(user, employee?.id),
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(
    user: AuthenticatedUser,
    filters: { status?: string; employeeId?: string; departmentId?: string; from?: string; to?: string },
  ) {
    this.assertStatus(filters.status);
    const scope = await this.scopeOf(user);
    return this.prisma.leaveRequest.findMany({
      where: {
        AND: [
          scope ? { employee: scope } : {},
          { status: filters.status as LeaveStatus | undefined, employeeId: filters.employeeId },
          filters.departmentId ? { employee: { user: { departmentId: filters.departmentId } } } : {},
          // Anything overlapping the range given.
          filters.to ? { startDate: { lte: dayOf(filters.to, 'to') } } : {},
          filters.from ? { endDate: { gte: dayOf(filters.from, 'from') } } : {},
        ],
      },
      include: INCLUDE,
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const request = await this.findOneOrThrow(id);
    if (request.employee.user.id === user.id) return request;
    const stage = STAGE_OF[request.status];
    if (stage && this.mayDecide(user, request, stage)) return request;
    const scope = await this.scopeOf(user);
    if (scope === null) return request;
    const visible = await this.prisma.employee.count({ where: { AND: [{ id: request.employeeId }, scope] } });
    if (visible === 0) throw new ForbiddenException('You cannot see this leave request');
    return request;
  }

  // Entitlement, what has been taken and what is waiting, per leave type.
  async balance(user: AuthenticatedUser, filters: { employeeId?: string; year?: string }) {
    const own = await this.employeeOf(user);
    const target = filters.employeeId ?? own?.id;
    if (!target) throw new NotFoundException('You have no employee record yet');
    if (target !== own?.id) {
      const scope = await this.scopeOf(user);
      if (scope !== null && (await this.prisma.employee.count({ where: { AND: [{ id: target }, scope] } })) === 0) {
        throw new ForbiddenException('You cannot see that person’s leave balance');
      }
    }
    const employee = await this.prisma.employee.findUnique({ where: { id: target } });
    if (!employee) throw new NotFoundException(`Employee ${target} not found`);

    const year = filters.year ? Number(filters.year) : Number((await this.today()).slice(0, 4));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('year must look like 2026');

    const types = await this.prisma.leaveType.findMany({ where: { organizationId: employee.organizationId, active: true }, orderBy: { name: 'asc' } });
    const balances = await Promise.all(
      types.map(async (type) => {
        const [used, pending] = await Promise.all([
          this.daysTaken(employee.id, type.id, year, ['APPROVED']),
          this.daysTaken(employee.id, type.id, year, PENDING),
        ]);
        return {
          leaveTypeId: type.id,
          name: type.name,
          paid: type.paid,
          entitlement: type.daysPerYear,
          used,
          pending,
          remaining: type.daysPerYear === null ? null : Math.max(0, type.daysPerYear - used - pending),
        };
      }),
    );
    return { employeeId: employee.id, year, balances };
  }

  // Who is away on a day (today by default), who goes away in the next month,
  // and how many requests are still waiting. Limited to what the viewer
  // oversees: everyone for HR, the director and admin; a department's or a
  // team's people for its head or supervisor.
  async onLeave(user: AuthenticatedUser, filters: { date?: string; departmentId?: string }) {
    const scope = await this.scopeOf(user);
    const day = filters.date === undefined || filters.date === '' ? await this.today() : filters.date;
    const date = dayOf(day, 'date');
    const where = (extra: Prisma.LeaveRequestWhereInput): Prisma.LeaveRequestWhereInput => ({
      AND: [
        scope ? { employee: scope } : {},
        filters.departmentId ? { employee: { user: { departmentId: filters.departmentId } } } : {},
        extra,
      ],
    });

    const [away, upcoming, waiting] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: where({ status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } }),
        include: INCLUDE,
        orderBy: { returnDate: 'asc' },
      }),
      this.prisma.leaveRequest.findMany({
        where: where({ status: 'APPROVED', startDate: { gt: date, lte: addDays(date, UPCOMING_DAYS) } }),
        include: INCLUDE,
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.leaveRequest.count({ where: where({ status: { in: PENDING } }) }),
    ]);

    const soon = addDays(date, RETURNING_SOON_DAYS);
    return {
      asOf: day,
      onLeave: away,
      upcoming,
      counts: {
        onLeave: away.length,
        returningThisWeek: away.filter((request) => request.returnDate <= soon).length,
        startingSoon: upcoming.length,
        awaitingApproval: waiting,
      },
    };
  }

  // --- helpers -----------------------------------------------------------------

  private isHr(user: AuthenticatedUser) {
    return user.roleName === HR_ROLE;
  }

  private seesAll(user: AuthenticatedUser) {
    return [ADMIN_ROLE, HR_ROLE, DIRECTOR_ROLE].includes(user.roleName ?? '');
  }

  private employeeOf(user: AuthenticatedUser) {
    return this.prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true, organizationId: true } });
  }

  // Whose leave this person may see: null for everyone's, otherwise a filter
  // on employees (people in departments they head, and their direct reports).
  private async scopeOf(user: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput | null> {
    if (this.seesAll(user)) return null;
    const employee = await this.employeeOf(user);
    const headed = await this.prisma.department.count({ where: { headId: user.id } });
    const reports = employee ? await this.prisma.employee.count({ where: { managerId: employee.id } }) : 0;
    if (headed === 0 && reports === 0) {
      throw new ForbiddenException('Only the executive director, HR, department heads and supervisors can see this');
    }
    const clauses: Prisma.EmployeeWhereInput[] = [];
    if (headed > 0) clauses.push({ user: { department: { headId: user.id } } });
    if (employee && reports > 0) clauses.push({ managerId: employee.id });
    return { OR: clauses };
  }

  // The requests waiting on this person, never their own.
  private awaitingWhere(user: AuthenticatedUser, employeeId?: string): Prisma.LeaveRequestWhereInput {
    const stages: Prisma.LeaveRequestWhereInput[] = [];
    if (user.roleName === ADMIN_ROLE) {
      stages.push({ status: { in: PENDING } });
    } else {
      if (this.isHr(user)) stages.push({ status: 'PENDING_HR' });
      if (user.roleName === DIRECTOR_ROLE) stages.push({ status: 'PENDING_DIRECTOR' });
      stages.push({
        status: 'PENDING_SUPERVISOR',
        employee: { OR: [{ user: { department: { headId: user.id } } }, ...(employeeId ? [{ managerId: employeeId }] : [])] },
      });
    }
    return { OR: stages, employee: { userId: { not: user.id } } };
  }

  private mayDecide(user: AuthenticatedUser, request: LeaveRow, stage: LeaveStage) {
    if (user.roleName === ADMIN_ROLE) return true;
    if (stage === 'HR') return this.isHr(user);
    if (stage === 'DIRECTOR') return user.roleName === DIRECTOR_ROLE;
    const department = request.employee.user.department;
    return request.employee.manager?.userId === user.id || department?.headId === user.id;
  }

  // Working days of a leave type already counted against a calendar year.
  private async daysTaken(employeeId: string, leaveTypeId: string, year: number, statuses: LeaveStatus[]) {
    const total = await this.prisma.leaveRequest.aggregate({
      where: {
        employeeId,
        leaveTypeId,
        status: { in: statuses },
        startDate: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T00:00:00.000Z`) },
      },
      _sum: { days: true },
    });
    return total._sum.days ?? 0;
  }

  private async findOneOrThrow(id: string): Promise<LeaveRow> {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!request) throw new NotFoundException(`Leave request ${id} not found`);
    return request;
  }

  private assertStatus(status?: string) {
    if (status !== undefined && !STATUSES.includes(status as LeaveStatus)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
  }

  private async today(): Promise<string> {
    return nowIn((await getSchedule(this.prisma)).timeZone).date;
  }

  private mailOf(request: LeaveRow) {
    return {
      employeeName: `${request.employee.user.firstName} ${request.employee.user.lastName}`.trim() || request.employee.user.email,
      employeeEmail: request.employee.user.email,
      leaveType: request.leaveType.name,
      startDate: request.startDate,
      endDate: request.endDate,
      returnDate: request.returnDate,
      days: request.days,
    };
  }

  // Tells whoever has to decide next.
  private notifyNext(request: LeaveRow, stage: LeaveStage) {
    const supervisors = [request.employee.manager?.user.email, request.employee.user.department?.head?.email].filter(
      (email, index, all): email is string => !!email && all.indexOf(email) === index,
    );
    return this.notifier.leaveAwaiting(this.mailOf(request), stage, supervisors);
  }
}
