import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AppointmentStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  AppointmentSchedule,
  applyScheduleChanges,
  dayOfWeek,
  getSchedule,
  isValidDateString,
  minutesToTime,
  nowIn,
  saveSchedule,
  timeToMinutes,
} from './appointment-schedule';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ReviewAppointmentDto } from './dto/review-appointment.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

export const APPOINTMENT_TYPES = [
  'Item collection / issue',
  'Equipment return',
  'Site visit',
  'Technical consultation',
  'Meeting with Store',
  'Other',
];

// A slot is taken while the appointment is waiting or approved.
const HOLDING_SLOT: AppointmentStatus[] = ['PENDING', 'APPROVED'];
const STATUSES: AppointmentStatus[] = ['PENDING', 'APPROVED', 'DECLINED', 'COMPLETED', 'CANCELLED'];
// Who runs the store, and so may see, cancel and review anyone's appointment.
const STORE_ROLES = ['admin', 'inventory'];

const INCLUDE = {
  requester: { select: { id: true, firstName: true, lastName: true, email: true } },
  feedbackBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  department: { select: { id: true, name: true } },
  items: { include: { item: { select: { id: true, sku: true, name: true, unitOfMeasure: true } } } },
} satisfies Prisma.AppointmentInclude;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fullName = (user: { firstName: string; lastName: string; email: string }) =>
  `${user.firstName} ${user.lastName}`.trim() || user.email;

interface Line {
  itemId: string;
  quantity: number;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  getSchedule(): Promise<AppointmentSchedule> {
    return getSchedule(this.prisma);
  }

  async updateSchedule(dto: UpdateScheduleDto): Promise<AppointmentSchedule> {
    const next = applyScheduleChanges(dto, await getSchedule(this.prisma));
    await saveSchedule(this.prisma, next);
    return next;
  }

  // Every slot of a day with how many bookings it already holds, so the
  // booking screen can grey out full and past ones.
  async slots(date: string) {
    this.assertDate(date);
    const schedule = await getSchedule(this.prisma);
    if (!schedule.workingDays.includes(dayOfWeek(date))) {
      return { working: false, slots: [] };
    }

    const booked = await this.prisma.appointment.findMany({
      where: { date: new Date(date), status: { in: HOLDING_SLOT } },
      select: { time: true },
    });
    const bookedAt = new Map<string, number>();
    booked.forEach(({ time }) => bookedAt.set(time, (bookedAt.get(time) ?? 0) + 1));

    const now = nowIn(schedule.timeZone);
    const start = timeToMinutes(schedule.workStart);
    const end = timeToMinutes(schedule.workEnd);
    const slots = [];
    for (let minutes = start; minutes + schedule.slotMinutes <= end; minutes += schedule.slotMinutes) {
      const time = minutesToTime(minutes);
      const count = bookedAt.get(time) ?? 0;
      const past = date < now.date || (date === now.date && minutes <= now.minutes);
      slots.push({ time, booked: count, capacity: schedule.slotCapacity, available: !past && count < schedule.slotCapacity });
    }
    return { working: true, slots };
  }

  async book(dto: CreateAppointmentDto, user: AuthenticatedUser) {
    this.assertDate(dto.date);
    const time = String(dto.time ?? '').trim();
    const subject = dto.subject?.trim();
    if (!subject) {
      throw new BadRequestException('Please give your appointment a subject');
    }

    const schedule = await getSchedule(this.prisma);
    const start = timeToMinutes(schedule.workStart);
    const minutes = timeToMinutes(time);
    if (Number.isNaN(minutes) || minutes < start || minutes + schedule.slotMinutes > timeToMinutes(schedule.workEnd) || (minutes - start) % schedule.slotMinutes !== 0) {
      throw new BadRequestException('Please choose a valid time slot');
    }
    const now = nowIn(schedule.timeZone);
    if (dto.date < now.date || (dto.date === now.date && minutes <= now.minutes)) {
      throw new BadRequestException('Please choose a future date and time');
    }
    if (!schedule.workingDays.includes(dayOfWeek(dto.date))) {
      throw new BadRequestException('Appointments are only available on working days');
    }

    const lines = await this.cleanLines(this.prisma, dto.items ?? []);

    return this.prisma.$transaction(async (tx) => {
      const taken = await tx.appointment.findMany({
        where: { date: new Date(dto.date), time, status: { in: HOLDING_SLOT } },
        select: { requesterId: true },
      });
      if (taken.length >= schedule.slotCapacity) {
        throw new BadRequestException('That time slot is full. Please pick another');
      }
      if (taken.some((appointment) => appointment.requesterId === user.id)) {
        throw new BadRequestException('You already have an appointment at that time');
      }

      return tx.appointment.create({
        data: {
          requesterId: user.id,
          departmentId: user.departmentId,
          date: new Date(dto.date),
          time,
          type: APPOINTMENT_TYPES.includes(dto.type ?? '') ? dto.type! : 'Other',
          subject,
          details: dto.details?.trim() || null,
          items: { create: lines.map(({ itemId, quantity }) => ({ itemId, quantity })) },
        },
        include: INCLUDE,
      });
    });
  }

  findMine(userId: string) {
    return this.prisma.appointment.findMany({
      where: { requesterId: userId },
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
  }

  findAll(filters: { status?: string; from?: string; to?: string }) {
    if (filters.status && !STATUSES.includes(filters.status as AppointmentStatus)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
    for (const value of [filters.from, filters.to]) {
      if (value) this.assertDate(value);
    }

    return this.prisma.appointment.findMany({
      where: {
        status: filters.status as AppointmentStatus | undefined,
        date:
          filters.from || filters.to
            ? { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined }
            : undefined,
      },
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      take: 1000,
    });
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const appointment = await this.findOneOrThrow(id);
    const mine = appointment.requesterId === user.id;
    if (!mine && !STORE_ROLES.includes(user.roleName ?? '')) {
      throw new ForbiddenException('You can only cancel your own appointments');
    }
    if (!HOLDING_SLOT.includes(appointment.status)) {
      throw new BadRequestException(`This appointment is already ${appointment.status.toLowerCase()}`);
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        feedbackById: user.id,
        feedbackAt: new Date(),
        feedback: mine ? appointment.feedback : (appointment.feedback ?? 'Cancelled by the store.'),
      },
      include: INCLUDE,
    });
  }

  // Approve, decline or complete. Completing can hand over the items: each
  // line is issued through the inventory engine in the same transaction, so a
  // shortage anywhere leaves the appointment and the stock untouched.
  async review(id: string, dto: ReviewAppointmentDto, reviewer: AuthenticatedUser) {
    const decision = dto.decision as 'APPROVED' | 'DECLINED' | 'COMPLETED';
    if (!['APPROVED', 'DECLINED', 'COMPLETED'].includes(decision)) {
      throw new BadRequestException('decision must be APPROVED, DECLINED or COMPLETED');
    }
    const appointment = await this.findOneOrThrow(id);
    const allowed: Partial<Record<AppointmentStatus, string[]>> = {
      PENDING: ['APPROVED', 'DECLINED', 'COMPLETED'],
      APPROVED: ['DECLINED', 'COMPLETED'],
    };
    if (!allowed[appointment.status]?.includes(decision)) {
      throw new BadRequestException(`This appointment is already ${appointment.status.toLowerCase()}`);
    }
    const feedback = dto.feedback?.trim();
    if ((decision === 'DECLINED' || decision === 'COMPLETED') && !feedback) {
      throw new BadRequestException('Please add feedback for the requester');
    }

    const lines = decision === 'COMPLETED' ? await this.cleanLines(this.prisma, dto.issue ?? []) : [];
    if (lines.length > 0) {
      if (!dto.warehouseId) {
        throw new BadRequestException('Choose the warehouse to issue the items from');
      }
      if (!dto.projectId && !appointment.departmentId) {
        throw new BadRequestException('This requester has no department. Choose a project / job to charge the items to');
      }
    }

    const today = nowIn((await getSchedule(this.prisma)).timeZone).date;

    return this.prisma.$transaction(async (tx) => {
      let issuedNote: string | undefined;
      if (decision === 'COMPLETED') {
        const issued: string[] = [];
        for (const line of lines) {
          await this.inventory.issueStock(
            tx,
            {
              warehouseId: dto.warehouseId!,
              itemId: line.itemId,
              quantity: line.quantity,
              date: today,
              departmentId: appointment.departmentId ?? undefined,
              projectId: dto.projectId,
              issuedTo: fullName(appointment.requester),
              purpose: appointment.subject,
            },
            reviewer.id,
            appointment.id,
          );
          issued.push(`${line.quantity} ${line.unit} ${line.name}`);
        }
        issuedNote = issued.length > 0 ? `Issued: ${issued.join('; ')}` : 'No items issued';
      }

      // Only move the appointment if nobody changed it since we read it, so
      // two people completing it at once cannot issue the stock twice.
      const moved = await tx.appointment.updateMany({
        where: { id, status: appointment.status },
        data: {
          status: decision,
          feedback: feedback ?? appointment.feedback,
          feedbackById: reviewer.id,
          feedbackAt: new Date(),
          issuedNote,
        },
      });
      if (moved.count === 0) {
        throw new ConflictException('This appointment was just changed by someone else. Reload and try again');
      }
      return tx.appointment.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
  }

  private async findOneOrThrow(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { requester: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }
    return appointment;
  }

  private assertDate(date: string) {
    if (!isValidDateString(String(date ?? ''))) {
      throw new BadRequestException('date must look like 2026-10-24');
    }
  }

  // Merges repeated items, checks quantities, and confirms every item still
  // exists (the name and unit come back for the "Issued: ..." note).
  private async cleanLines(
    db: Pick<PrismaService, 'inventoryItem'>,
    raw: Line[],
  ): Promise<(Line & { name: string; unit: string })[]> {
    const totals = new Map<string, number>();
    for (const line of raw) {
      const quantity = round3(Number(line?.quantity));
      if (!line?.itemId || !(quantity > 0)) {
        throw new BadRequestException('Each item needs a positive quantity');
      }
      totals.set(line.itemId, round3((totals.get(line.itemId) ?? 0) + quantity));
    }
    if (totals.size === 0) return [];

    const items = await db.inventoryItem.findMany({ where: { id: { in: [...totals.keys()] }, deletedAt: null } });
    const byId = new Map(items.map((item) => [item.id, item]));
    return [...totals].map(([itemId, quantity]) => {
      const item = byId.get(itemId);
      if (!item) {
        throw new NotFoundException(`Inventory item ${itemId} not found`);
      }
      return { itemId, quantity, name: item.name, unit: item.unitOfMeasure };
    });
  }
}
