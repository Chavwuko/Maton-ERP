import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScheduleBasis, ScheduleIntervalUnit, WorkOrderPriority } from '@prisma/client';
import type { AuthenticatedUser } from '../../../auth/cognito-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { getSchedule, isValidDateString, nowIn } from '../../appointments/appointment-schedule';
import { EmailNotifier } from '../../mail/email-notifier';
import { CreateMaintenanceScheduleDto } from './dto/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dto/update-maintenance-schedule.dto';
import { addDays, addInterval, dueStatus, type DueStatus } from './schedule-dates';

const UNITS: ScheduleIntervalUnit[] = ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'];
const BASES: ScheduleBasis[] = ['FIXED', 'FLOATING'];
const PRIORITIES: WorkOrderPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DUE_STATUSES: DueStatus[] = ['PAUSED', 'OVERDUE', 'DUE_SOON', 'UPCOMING'];
// A work order generated for a due date this far gone is stopped chasing.
const MAX_LEAD_DAYS = 365;
const MAX_INTERVAL = 1000;
// Safety net for FIXED schedules catching up after a very long lapse.
const MAX_CATCH_UP_STEPS = 5000;

const PERSON = { select: { id: true, firstName: true, lastName: true, email: true } } as const;
const INCLUDE = {
  asset: { select: { id: true, assetTag: true, name: true, status: true } },
  assignedTo: PERSON,
} as const;

@Injectable()
export class MaintenanceSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: EmailNotifier,
  ) {}

  async findAll(filters: { organizationId?: string; assetId?: string; active?: string; dueStatus?: string }) {
    if (filters.dueStatus !== undefined && !DUE_STATUSES.includes(filters.dueStatus as DueStatus)) {
      throw new BadRequestException(`dueStatus must be one of: ${DUE_STATUSES.join(', ')}`);
    }
    const today = await this.today();
    const schedules = await this.prisma.maintenanceSchedule.findMany({
      where: {
        organizationId: filters.organizationId,
        assetId: filters.assetId,
        active: filters.active === undefined ? undefined : filters.active === 'true',
      },
      include: INCLUDE,
      orderBy: { nextDueDate: 'asc' },
    });
    return schedules
      .map((schedule) => ({ ...schedule, dueStatus: dueStatus(schedule, today) }))
      .filter((schedule) => !filters.dueStatus || schedule.dueStatus === filters.dueStatus);
  }

  async findOne(id: string) {
    const schedule = await this.prisma.maintenanceSchedule.findUnique({ where: { id }, include: INCLUDE });
    if (!schedule) {
      throw new NotFoundException(`Maintenance schedule ${id} not found`);
    }
    return { ...schedule, dueStatus: dueStatus(schedule, await this.today()) };
  }

  async create(dto: CreateMaintenanceScheduleDto, user: AuthenticatedUser) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) {
      throw new NotFoundException(`Asset ${dto.assetId} not found`);
    }
    if (asset.status === 'DECOMMISSIONED') {
      throw new BadRequestException('Cannot schedule maintenance for a decommissioned asset');
    }
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('title is required');
    }
    if (dto.firstDueDate === undefined) {
      throw new BadRequestException('firstDueDate must be a date like 2026-10-24');
    }
    const fields = (await this.fields(dto)) as Partial<Prisma.MaintenanceScheduleUncheckedCreateInput>;

    const created = await this.prisma.maintenanceSchedule.create({
      data: {
        ...fields,
        organizationId: asset.organizationId,
        assetId: asset.id,
        title,
        intervalValue: this.interval(dto.intervalValue),
        intervalUnit: this.pick(dto.intervalUnit, UNITS, 'intervalUnit') as ScheduleIntervalUnit,
        nextDueDate: this.day(dto.firstDueDate, 'firstDueDate'),
        createdById: user.id,
      },
    });
    // A schedule that is already inside its lead time opens its work order now.
    await this.generateDue(created.id);
    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateMaintenanceScheduleDto) {
    await this.findOne(id);
    const data: Prisma.MaintenanceScheduleUncheckedUpdateInput = await this.fields(dto);

    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('title cannot be blank');
      data.title = dto.title.trim();
    }
    if (dto.intervalValue !== undefined) data.intervalValue = this.interval(dto.intervalValue);
    if (dto.intervalUnit !== undefined) data.intervalUnit = this.pick(dto.intervalUnit, UNITS, 'intervalUnit') as ScheduleIntervalUnit;
    if (dto.nextDueDate !== undefined) data.nextDueDate = this.day(dto.nextDueDate, 'nextDueDate');
    if (dto.active !== undefined) {
      if (typeof dto.active !== 'boolean') throw new BadRequestException('active must be true or false');
      data.active = dto.active;
    }

    await this.prisma.maintenanceSchedule.update({ where: { id }, data });
    await this.generateDue(id);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    // Work orders it opened stay, just no longer tied to a schedule.
    return this.prisma.maintenanceSchedule.delete({ where: { id } });
  }

  // Opens a PREVENTIVE work order for every active schedule whose due date is
  // inside its lead time and that has none open. Safe to run repeatedly: the
  // database allows only one open work order per schedule.
  async generateDue(onlyScheduleId?: string) {
    const todayDate = new Date(`${await this.today()}T00:00:00.000Z`);
    const candidates = await this.prisma.maintenanceSchedule.findMany({
      where: {
        id: onlyScheduleId,
        active: true,
        asset: { status: { not: 'DECOMMISSIONED' } },
        nextDueDate: { lte: addDays(todayDate, MAX_LEAD_DAYS) },
      },
      include: { asset: { select: { assetTag: true, name: true } }, assignedTo: PERSON },
    });

    const created: { id: string; title: string; assetTag: string }[] = [];
    for (const schedule of candidates.filter((s) => s.nextDueDate <= addDays(todayDate, s.leadDays))) {
      try {
        const workOrder = await this.prisma.workOrder.create({
          data: {
            organizationId: schedule.organizationId,
            assetId: schedule.assetId,
            title: schedule.title,
            description: schedule.description,
            type: 'PREVENTIVE',
            priority: schedule.priority,
            dueDate: schedule.nextDueDate,
            assignedToId: schedule.assignedToId,
            requestedById: schedule.createdById,
            scheduleId: schedule.id,
          },
        });
        created.push({ id: workOrder.id, title: workOrder.title, assetTag: schedule.asset.assetTag });
        void this.notifier.scheduledWorkOrder({
          title: schedule.title,
          assetTag: schedule.asset.assetTag,
          assetName: schedule.asset.name,
          dueDate: schedule.nextDueDate,
          assignee: schedule.assignedTo,
        });
      } catch (err) {
        // One is already open for this schedule: nothing to do.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    return { created: created.length, workOrders: created };
  }

  // Called when a work order that came from a schedule is finished. Completing
  // it moves the schedule to its next due date; cancelling skips this one.
  async onWorkOrderClosed(tx: Prisma.TransactionClient, scheduleId: string, status: 'COMPLETED' | 'CANCELLED') {
    const schedule = await tx.maintenanceSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) return;

    if (status === 'CANCELLED') {
      await tx.maintenanceSchedule.update({
        where: { id: scheduleId },
        data: { nextDueDate: addInterval(schedule.nextDueDate, schedule.intervalValue, schedule.intervalUnit) },
      });
      return;
    }

    const completedOn = new Date(`${nowIn((await getSchedule(tx)).timeZone).date}T00:00:00.000Z`);
    let next: Date;
    if (schedule.basis === 'FLOATING') {
      next = addInterval(completedOn, schedule.intervalValue, schedule.intervalUnit);
    } else {
      // Stay on the calendar, but never land on a date that has already passed.
      next = addInterval(schedule.nextDueDate, schedule.intervalValue, schedule.intervalUnit);
      for (let step = 0; next <= completedOn && step < MAX_CATCH_UP_STEPS; step++) {
        next = addInterval(next, schedule.intervalValue, schedule.intervalUnit);
      }
    }
    await tx.maintenanceSchedule.update({ where: { id: scheduleId }, data: { lastCompletedDate: completedOn, nextDueDate: next } });
  }

  // --- helpers -----------------------------------------------------------------

  // The fields shared by create and update; undefined means "leave alone".
  private async fields(dto: CreateMaintenanceScheduleDto | UpdateMaintenanceScheduleDto) {
    const data: Prisma.MaintenanceScheduleUncheckedUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.basis !== undefined) data.basis = this.pick(dto.basis, BASES, 'basis') as ScheduleBasis;
    if (dto.priority !== undefined) data.priority = this.pick(dto.priority, PRIORITIES, 'priority') as WorkOrderPriority;
    if (dto.leadDays !== undefined) {
      const days = Number(dto.leadDays);
      if (!Number.isInteger(days) || days < 0 || days > MAX_LEAD_DAYS) {
        throw new BadRequestException(`leadDays must be a whole number from 0 to ${MAX_LEAD_DAYS}`);
      }
      data.leadDays = days;
    }
    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId) {
        const assignee = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
        if (!assignee) throw new NotFoundException(`User ${dto.assignedToId} not found`);
        if (assignee.status !== 'ACTIVE') throw new BadRequestException('That person does not have an active account');
      }
      data.assignedToId = dto.assignedToId || null;
    }
    return data;
  }

  private interval(value: unknown): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_INTERVAL) {
      throw new BadRequestException(`intervalValue must be a whole number from 1 to ${MAX_INTERVAL}`);
    }
    return n;
  }

  private pick(value: string | undefined, allowed: readonly string[], field: string): string {
    if (value === undefined || !allowed.includes(value)) {
      throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
    }
    return value;
  }

  private day(value: string, field: string): Date {
    if (!isValidDateString(String(value))) {
      throw new BadRequestException(`${field} must be a date like 2026-10-24`);
    }
    return new Date(`${value}T00:00:00.000Z`);
  }

  private async today(): Promise<string> {
    return nowIn((await getSchedule(this.prisma)).timeZone).date;
  }
}
