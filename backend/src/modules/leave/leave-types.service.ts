import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave.dto';

// A starting set, all editable afterwards: what HR would otherwise type in.
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual leave', daysPerYear: 21, paid: true, allowBackdate: false },
  { name: 'Sick leave', daysPerYear: 10, paid: true, allowBackdate: true },
  { name: 'Maternity leave', daysPerYear: 90, paid: true, allowBackdate: false },
  { name: 'Paternity leave', daysPerYear: 10, paid: true, allowBackdate: false },
  { name: 'Compassionate leave', daysPerYear: 5, paid: true, allowBackdate: true },
  { name: 'Study leave', daysPerYear: 10, paid: true, allowBackdate: false },
  { name: 'Unpaid leave', daysPerYear: null, paid: false, allowBackdate: false },
];

const MAX_DAYS_PER_YEAR = 366;

@Injectable()
export class LeaveTypesService {
  constructor(private readonly prisma: PrismaService) {}

  // Active types by default (what people choose from); HR asks for all.
  findAll(filters: { organizationId?: string; includeInactive?: boolean }) {
    return this.prisma.leaveType.findMany({
      where: { organizationId: filters.organizationId, active: filters.includeInactive ? undefined : true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateLeaveTypeDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const daysPerYear = this.days(dto.daysPerYear);
    await this.assertOrganization(dto.organizationId);
    try {
      return await this.prisma.leaveType.create({
        data: {
          organizationId: dto.organizationId,
          name,
          daysPerYear: daysPerYear ?? null,
          paid: dto.paid ?? true,
          allowBackdate: dto.allowBackdate ?? false,
        },
      });
    } catch (err) {
      this.rethrowDuplicate(err, name);
      throw err;
    }
  }

  async update(id: string, dto: UpdateLeaveTypeDto) {
    const data: Prisma.LeaveTypeUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('name cannot be blank');
      data.name = dto.name.trim();
    }
    const daysPerYear = this.days(dto.daysPerYear);
    if (daysPerYear !== undefined) data.daysPerYear = daysPerYear;
    if (dto.paid !== undefined) data.paid = dto.paid;
    if (dto.allowBackdate !== undefined) data.allowBackdate = dto.allowBackdate;
    if (dto.active !== undefined) data.active = dto.active;

    try {
      return await this.prisma.leaveType.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Leave type ${id} not found`);
      }
      this.rethrowDuplicate(err, dto.name);
      throw err;
    }
  }

  // Adds whichever of the standard types the organization does not have yet.
  async createDefaults(organizationId: string) {
    await this.assertOrganization(organizationId);
    await this.prisma.leaveType.createMany({
      data: DEFAULT_LEAVE_TYPES.map((type) => ({ ...type, organizationId })),
      skipDuplicates: true,
    });
    return this.findAll({ organizationId, includeInactive: true });
  }

  // undefined leaves it alone; null or '' means no limit.
  private days(value: number | null | undefined): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || (value as unknown) === '') return null;
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS_PER_YEAR) {
      throw new BadRequestException(`daysPerYear must be a whole number from 1 to ${MAX_DAYS_PER_YEAR}`);
    }
    return days;
  }

  private async assertOrganization(organizationId: string) {
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId } }))) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }
  }

  private rethrowDuplicate(err: unknown, name?: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException(`There is already a leave type called "${name}"`);
    }
  }
}
