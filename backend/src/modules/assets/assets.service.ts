import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetCondition, AssetStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { CheckInAssetDto } from './dto/check-in-asset.dto';
import { CheckOutAssetDto } from './dto/check-out-asset.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

const CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];
const STATUSES: AssetStatus[] = ['ACTIVE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED'];
// The only statuses a person may set by hand; UNDER_MAINTENANCE belongs to the
// work orders (see MaintenanceService).
const MANUAL_STATUSES: AssetStatus[] = ['ACTIVE', 'DECOMMISSIONED'];

const PERSON = { select: { id: true, firstName: true, lastName: true, email: true } } as const;
const NAMED = { select: { id: true, name: true } } as const;

// The open assignment is at most one row, so asking for one is enough.
const HOLDER = {
  where: { returnedAt: null },
  take: 1,
  include: { assignee: PERSON, department: NAMED },
} as const;
const LIST_INCLUDE = { assignments: HOLDER, vendor: NAMED, department: NAMED } as const;

type WithAssignments<T> = T & { assignments: unknown[] };

// Hands the client `currentAssignment` instead of a one-element list.
function present<T extends WithAssignments<object>>(asset: T) {
  const { assignments, ...rest } = asset;
  return { ...rest, currentAssignment: assignments[0] ?? null };
}

const holderName = (assignment: { assignee: { firstName: string; lastName: string; email: string } | null; department: { name: string } | null }) =>
  assignment.assignee
    ? `${assignment.assignee.firstName} ${assignment.assignee.lastName}`.trim() || assignment.assignee.email
    : (assignment.department?.name ?? 'someone');

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    organizationId?: string;
    status?: string;
    projectId?: string;
    departmentId?: string;
    condition?: string;
    assignedToId?: string;
    search?: string;
  }) {
    this.assertEnum(filters.status, STATUSES, 'status');
    this.assertEnum(filters.condition, CONDITIONS, 'condition');
    const search = filters.search?.trim();

    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId: filters.organizationId,
        status: filters.status as AssetStatus | undefined,
        projectId: filters.projectId,
        departmentId: filters.departmentId,
        condition: filters.condition as AssetCondition | undefined,
        assignments: filters.assignedToId ? { some: { assigneeId: filters.assignedToId, returnedAt: null } } : undefined,
        OR: search
          ? [
              { assetTag: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { serialNumber: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return assets.map(present);
  }

  // What the signed-in person is holding right now.
  findMine(userId: string) {
    return this.findAll({ assignedToId: userId });
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { ...LIST_INCLUDE, workOrders: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return present(asset);
  }

  async create(dto: CreateAssetDto) {
    const data = await this.fields(dto, dto.organizationId);
    try {
      const asset = await this.prisma.asset.create({
        data: {
          ...(data as Prisma.AssetUncheckedCreateInput),
          organizationId: dto.organizationId,
          assetTag: dto.assetTag,
          name: dto.name,
          category: dto.category,
        },
        include: LIST_INCLUDE,
      });
      return present(asset);
    } catch (err) {
      this.rethrowDuplicate(err, dto.assetTag, dto.serialNumber);
      throw err;
    }
  }

  async update(id: string, dto: UpdateAssetDto) {
    const asset = await this.prisma.asset.findUnique({ where: { id }, include: { assignments: HOLDER } });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }

    const data = await this.fields(dto, asset.organizationId, asset);
    for (const key of ['assetTag', 'name', 'category'] as const) {
      if (dto[key] !== undefined) {
        const value = String(dto[key]).trim();
        if (!value) throw new BadRequestException(`${key} cannot be blank`);
        data[key] = value;
      }
    }
    if (dto.status !== undefined) {
      if (!MANUAL_STATUSES.includes(dto.status as AssetStatus)) {
        throw new BadRequestException('Status can only be set to ACTIVE or DECOMMISSIONED; maintenance work orders set the rest');
      }
      if (asset.status === 'UNDER_MAINTENANCE') {
        throw new BadRequestException('This asset is under maintenance; complete or cancel its work order first');
      }
      if (dto.status === 'DECOMMISSIONED' && asset.assignments.length > 0) {
        throw new BadRequestException('Check the asset back in before decommissioning it');
      }
      data.status = dto.status as AssetStatus;
    }

    try {
      const updated = await this.prisma.asset.update({ where: { id }, data, include: LIST_INCLUDE });
      return present(updated);
    } catch (err) {
      this.rethrowDuplicate(err, dto.assetTag, dto.serialNumber ?? undefined);
      throw err;
    }
  }

  async checkOut(id: string, dto: CheckOutAssetDto, user: AuthenticatedUser) {
    const asset = await this.prisma.asset.findUnique({ where: { id }, include: { assignments: HOLDER } });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    if (asset.status !== 'ACTIVE') {
      throw new BadRequestException(`This asset is ${asset.status.toLowerCase().replace('_', ' ')} and cannot be checked out`);
    }
    if (asset.assignments.length > 0) {
      throw new ConflictException(`Already checked out to ${holderName(asset.assignments[0])}`);
    }
    if (!dto.assigneeId && !dto.departmentId) {
      throw new BadRequestException('Choose a person or a department to check the asset out to');
    }
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee) throw new NotFoundException(`User ${dto.assigneeId} not found`);
      if (assignee.status !== 'ACTIVE') throw new BadRequestException('That person does not have an active account');
    }
    if (dto.departmentId) {
      await this.assertExists(this.prisma.department.findUnique({ where: { id: dto.departmentId } }), 'Department', dto.departmentId);
    }
    this.assertEnum(dto.condition, CONDITIONS, 'condition');

    try {
      await this.prisma.assetAssignment.create({
        data: {
          assetId: id,
          assigneeId: dto.assigneeId,
          departmentId: dto.departmentId,
          expectedReturn: this.date(dto.expectedReturn, 'expectedReturn'),
          conditionOut: (dto.condition as AssetCondition | undefined) ?? asset.condition,
          notes: dto.notes?.trim() || null,
          assignedById: user.id,
        },
      });
    } catch (err) {
      // The partial unique index: someone checked it out between our read and write.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This asset was just checked out by someone else');
      }
      throw err;
    }
    return this.findOne(id);
  }

  async checkIn(id: string, dto: CheckInAssetDto, user: AuthenticatedUser) {
    await this.findOne(id);
    this.assertEnum(dto.condition, CONDITIONS, 'condition');

    const open = await this.prisma.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } });
    if (!open) {
      throw new BadRequestException('This asset is not checked out');
    }

    await this.prisma.$transaction(async (tx) => {
      const closed = await tx.assetAssignment.updateMany({
        where: { id: open.id, returnedAt: null },
        data: {
          returnedAt: new Date(),
          conditionIn: dto.condition as AssetCondition | undefined,
          returnNotes: dto.notes?.trim() || null,
          returnedById: user.id,
        },
      });
      if (closed.count === 0) {
        throw new ConflictException('This asset was just checked in by someone else');
      }
      // The condition it came back in is now its condition.
      if (dto.condition) {
        await tx.asset.update({ where: { id }, data: { condition: dto.condition as AssetCondition } });
      }
    });
    return this.findOne(id);
  }

  // Custody history, newest first: who held it, when, and in what condition.
  async assignments(id: string) {
    await this.findOne(id);
    return this.prisma.assetAssignment.findMany({
      where: { assetId: id },
      include: { assignee: PERSON, department: NAMED, assignedBy: PERSON, returnedBy: PERSON },
      orderBy: { assignedAt: 'desc' },
    });
  }

  // Every change made to this asset, from the activity log.
  async history(id: string) {
    await this.findOne(id);
    return this.prisma.auditLog.findMany({
      where: { entityType: 'Asset', entityId: id },
      include: { user: PERSON },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // --- helpers ---------------------------------------------------------------

  // The optional columns shared by create and update, validated and converted.
  // Undefined means "leave alone"; null or '' means "clear" where that is allowed.
  private async fields(
    dto: CreateAssetDto | UpdateAssetDto,
    organizationId: string,
    existing?: { purchaseDate: Date | null; warrantyExpiry: Date | null },
  ) {
    const data: Prisma.AssetUncheckedUpdateInput = {};
    const text = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);

    for (const key of ['location', 'serialNumber', 'make', 'model', 'notes'] as const) {
      const value = text(dto[key]);
      if (value !== undefined) data[key] = value;
    }

    const purchaseDate = this.date(dto.purchaseDate, 'purchaseDate');
    const warrantyExpiry = this.date(dto.warrantyExpiry, 'warrantyExpiry');
    if (purchaseDate !== undefined) data.purchaseDate = purchaseDate;
    if (warrantyExpiry !== undefined) data.warrantyExpiry = warrantyExpiry;
    const bought = purchaseDate === undefined ? existing?.purchaseDate : purchaseDate;
    const covered = warrantyExpiry === undefined ? existing?.warrantyExpiry : warrantyExpiry;
    if (bought && covered && covered < bought) {
      throw new BadRequestException('The warranty cannot expire before the purchase date');
    }

    if (dto.purchaseCost !== undefined) {
      if (dto.purchaseCost === null || (dto.purchaseCost as unknown) === '') {
        data.purchaseCost = null;
      } else {
        const cost = Number(dto.purchaseCost);
        if (!Number.isFinite(cost) || cost < 0) throw new BadRequestException('purchaseCost must be zero or more');
        data.purchaseCost = new Prisma.Decimal(cost).toDecimalPlaces(2);
      }
    }

    if (dto.condition !== undefined) {
      this.assertEnum(dto.condition, CONDITIONS, 'condition');
      data.condition = dto.condition as AssetCondition;
    }

    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
      if (!vendor) throw new NotFoundException(`Vendor ${dto.vendorId} not found`);
      if (vendor.organizationId !== organizationId) throw new BadRequestException('That supplier belongs to a different organization');
    }
    if (dto.departmentId) {
      await this.assertExists(this.prisma.department.findUnique({ where: { id: dto.departmentId } }), 'Department', dto.departmentId);
    }
    if (dto.projectId) {
      await this.assertExists(this.prisma.project.findUnique({ where: { id: dto.projectId } }), 'Project', dto.projectId);
    }
    for (const key of ['vendorId', 'departmentId', 'projectId'] as const) {
      if (dto[key] !== undefined) data[key] = dto[key] || null;
    }
    return data;
  }

  private date(value: string | null | undefined, field: string): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(NaN);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} must be a date like 2026-10-24`);
    }
    return parsed;
  }

  private assertEnum(value: string | undefined, allowed: readonly string[], field: string) {
    if (value !== undefined && !allowed.includes(value)) {
      throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
    }
  }

  private async assertExists(lookup: Promise<unknown>, what: string, id: string) {
    if (!(await lookup)) {
      throw new NotFoundException(`${what} ${id} not found`);
    }
  }

  private rethrowDuplicate(err: unknown, assetTag?: string, serialNumber?: string | null) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String((err.meta as { target?: unknown } | undefined)?.target ?? '');
      throw new ConflictException(
        target.includes('serialNumber')
          ? `Serial number "${serialNumber}" is already used by another asset in this organization`
          : `Asset tag "${assetTag}" already exists in this organization`,
      );
    }
  }
}
