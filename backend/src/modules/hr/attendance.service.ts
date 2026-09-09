import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAttendanceRecordDto } from './dto/create-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';

// Clocking in later than this many minutes past the assigned shift's start
// time is marked LATE instead of PRESENT.
const LATE_GRACE_MINUTES = 10;

// AttendanceRecord.date is always stored/queried at UTC midnight for the
// calendar day it represents, regardless of the time-of-day it was written.
function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function scheduledStart(day: Date, shiftStartTime: string): Date {
  const [hours, minutes] = shiftStartTime.split(':').map(Number);
  const start = dateOnly(day);
  start.setUTCHours(hours, minutes, 0, 0);
  return start;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { shift: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const now = new Date();
    const today = dateOnly(now);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing?.clockIn) {
      throw new ConflictException('Already clocked in today');
    }

    const status: AttendanceStatus =
      employee.shift && now > addMinutes(scheduledStart(today, employee.shift.startTime), LATE_GRACE_MINUTES)
        ? 'LATE'
        : 'PRESENT';

    if (existing) {
      return this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { clockIn: now, status },
      });
    }
    return this.prisma.attendanceRecord.create({
      data: { employeeId, date: today, clockIn: now, status },
    });
  }

  async clockOut(employeeId: string) {
    const today = dateOnly(new Date());
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (!existing?.clockIn) {
      throw new BadRequestException('Must clock in before clocking out');
    }
    if (existing.clockOut) {
      throw new ConflictException('Already clocked out today');
    }
    return this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { clockOut: new Date() },
    });
  }

  findForEmployee(employeeId: string, filters: { from?: string; to?: string } = {}) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        date: {
          gte: filters.from ? dateOnly(new Date(filters.from)) : undefined,
          lte: filters.to ? dateOnly(new Date(filters.to)) : undefined,
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  findAll(filters: { employeeId?: string; from?: string; to?: string; status?: AttendanceStatus } = {}) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        employeeId: filters.employeeId,
        status: filters.status,
        date: {
          gte: filters.from ? dateOnly(new Date(filters.from)) : undefined,
          lte: filters.to ? dateOnly(new Date(filters.to)) : undefined,
        },
      },
      include: { employee: true },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateAttendanceRecordDto) {
    try {
      return await this.prisma.attendanceRecord.create({
        data: {
          employeeId: dto.employeeId,
          date: dateOnly(new Date(dto.date)),
          status: dto.status,
          clockIn: dto.clockIn ? new Date(dto.clockIn) : undefined,
          clockOut: dto.clockOut ? new Date(dto.clockOut) : undefined,
          notes: dto.notes,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`An attendance record for this employee on ${dto.date} already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAttendanceRecordDto) {
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }
    return this.prisma.attendanceRecord.update({
      where: { id },
      data: {
        status: dto.status,
        clockIn: dto.clockIn ? new Date(dto.clockIn) : undefined,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : undefined,
        notes: dto.notes,
      },
    });
  }
}
