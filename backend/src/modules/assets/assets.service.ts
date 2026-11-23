import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Asset, AssetCondition, AssetStatus, DepreciationMethod, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { getSchedule, isValidDateString, nowIn } from '../appointments/appointment-schedule';
import { addDays, dayString, dueStatus } from '../maintenance/schedules/schedule-dates';
import { toCsv } from '../reports/csv';
import { valueAt, yearlySchedule, type Depreciable } from './asset-valuation';
import { CheckInAssetDto } from './dto/check-in-asset.dto';
import { CheckOutAssetDto } from './dto/check-out-asset.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

const CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];
const METHODS: DepreciationMethod[] = ['NONE', 'STRAIGHT_LINE', 'DECLINING_BALANCE'];
// Fifty years is longer than anything on a plant register.
const MAX_LIFE_MONTHS = 600;
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

const WARRANTY_WARNING_DAYS = 60;
const DASHBOARD_LIST_SIZE = 10;

export interface AssetFilters {
  organizationId?: string;
  status?: string;
  projectId?: string;
  departmentId?: string;
  condition?: string;
  assignedToId?: string;
  search?: string;
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: AssetFilters) {
    const assets = await this.prisma.asset.findMany({
      where: this.listWhere(filters),
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return assets.map(present);
  }

  // The register as a spreadsheet, with the same filters as the list. Money
  // columns are left out for the staff role.
  async exportRegister(filters: AssetFilters, includeMoney: boolean) {
    const day = await this.asOfDay();
    const assets = await this.prisma.asset.findMany({
      where: this.listWhere(filters),
      include: LIST_INCLUDE,
      orderBy: [{ category: 'asc' }, { assetTag: 'asc' }],
    });
    const headers = [
      'Asset tag', 'Name', 'Category', 'Status', 'Condition', 'Location', 'Department', 'Make', 'Model', 'Serial number',
      'Purchase date', 'Supplier', 'Warranty expires', 'Held by',
      ...(includeMoney ? ['Purchase cost', 'Salvage value', 'Depreciation', 'Accumulated depreciation', 'Book value'] : []),
    ];
    const rows = assets.map((asset) => {
      const value = this.valued(asset, day);
      return [
        asset.assetTag, asset.name, asset.category, asset.status, asset.condition, asset.location, asset.department?.name,
        asset.make, asset.model, asset.serialNumber, this.isoDate(asset.purchaseDate), asset.vendor?.name,
        this.isoDate(asset.warrantyExpiry), asset.assignments[0] ? holderName(asset.assignments[0]) : '',
        ...(includeMoney
          ? [
              asset.purchaseCost?.toNumber(), asset.salvageValue?.toNumber(), asset.depreciationMethod,
              value.accumulatedDepreciation?.toNumber(), value.bookValue?.toNumber(),
            ]
          : []),
      ];
    });
    return { filename: `assets-${day}.csv`, content: toCsv(headers, rows) };
  }

  // The valuation report as a spreadsheet, with a totals row.
  async exportValuation(filters: { organizationId?: string; asOf?: string; includeDecommissioned?: string }) {
    const report = await this.valuationReport(filters);
    const headers = ['Asset tag', 'Name', 'Category', 'Status', 'Depreciation', 'Purchase cost', 'Accumulated depreciation', 'Book value', 'Fully depreciated'];
    const rows = report.rows.map((row) => [
      row.assetTag, row.name, row.category, row.status, row.method, row.cost?.toNumber(), row.accumulatedDepreciation?.toNumber(),
      row.bookValue?.toNumber(), row.fullyDepreciated ? 'Yes' : 'No',
    ]);
    const { totals } = report;
    rows.push(['', 'Total', '', '', '', totals.cost.toNumber(), totals.accumulatedDepreciation.toNumber(), totals.bookValue.toNumber(), '']);
    return { filename: `asset-valuation-${report.asOf}.csv`, content: toCsv(headers, rows) };
  }

  // The asset overview: how many, in what state, what needs attention, and
  // what the register is worth.
  async dashboard(filters: { organizationId?: string }) {
    const day = await this.asOfDay();
    const today = new Date(`${day}T00:00:00.000Z`);
    const organizationId = filters.organizationId;
    const warrantyWhere: Prisma.AssetWhereInput = {
      organizationId,
      status: { not: 'DECOMMISSIONED' },
      warrantyExpiry: { gte: today, lte: addDays(today, WARRANTY_WARNING_DAYS) },
    };
    const overdueWhere: Prisma.AssetAssignmentWhereInput = { returnedAt: null, expectedReturn: { lt: today }, asset: { organizationId } };

    const [byStatus, byCondition, checkedOut, overdueCount, overdueItems, warrantyCount, warrantyItems, openWorkOrders, schedules, valuation] =
      await Promise.all([
        this.prisma.asset.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
        this.prisma.asset.groupBy({ by: ['condition'], where: { organizationId, status: { not: 'DECOMMISSIONED' } }, _count: { _all: true } }),
        this.prisma.assetAssignment.count({ where: { returnedAt: null, asset: { organizationId } } }),
        this.prisma.assetAssignment.count({ where: overdueWhere }),
        this.prisma.assetAssignment.findMany({
          where: overdueWhere,
          include: { asset: { select: { id: true, assetTag: true, name: true } }, assignee: PERSON, department: NAMED },
          orderBy: { expectedReturn: 'asc' },
          take: DASHBOARD_LIST_SIZE,
        }),
        this.prisma.asset.count({ where: warrantyWhere }),
        this.prisma.asset.findMany({
          where: warrantyWhere,
          select: { id: true, assetTag: true, name: true, warrantyExpiry: true },
          orderBy: { warrantyExpiry: 'asc' },
          take: DASHBOARD_LIST_SIZE,
        }),
        this.prisma.workOrder.count({ where: { organizationId, status: { in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] } } }),
        this.prisma.maintenanceSchedule.findMany({
          where: { organizationId, active: true, asset: { status: { not: 'DECOMMISSIONED' } } },
          select: { active: true, nextDueDate: true, leadDays: true },
        }),
        this.valuationReport({ organizationId, asOf: day }),
      ]);

    const standing = schedules.map((schedule) => dueStatus(schedule, day));
    return {
      asOf: day,
      // Not `total`: the staff cost filter strips every field with that name.
      assetCount: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: byStatus.map((row) => ({ label: row.status, count: row._count._all })),
      byCondition: byCondition.map((row) => ({ label: row.condition, count: row._count._all })),
      checkedOut,
      overdueReturns: { count: overdueCount, items: overdueItems },
      warrantyExpiring: { count: warrantyCount, items: warrantyItems },
      maintenance: {
        openWorkOrders,
        overdueSchedules: standing.filter((status) => status === 'OVERDUE').length,
        dueSoonSchedules: standing.filter((status) => status === 'DUE_SOON').length,
      },
      totals: { bookValue: valuation.totals.bookValue, notValued: valuation.totals.notValued },
    };
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

  // What has been done to the asset: every completed work order, with notes,
  // cost and the parts taken from stock for it, plus the totals.
  async serviceHistory(id: string) {
    await this.findOne(id);
    const workOrders = await this.prisma.workOrder.findMany({
      where: { assetId: id, status: 'COMPLETED' },
      include: {
        assignedTo: PERSON,
        stockTransactions: {
          where: { type: 'ISSUE' },
          include: { item: { select: { id: true, sku: true, name: true, unitOfMeasure: true } } },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    const totalCost = workOrders.reduce((sum, workOrder) => sum.plus(workOrder.cost ?? 0), new Prisma.Decimal(0));
    return {
      workOrders,
      totals: {
        count: workOrders.length,
        preventive: workOrders.filter((workOrder) => workOrder.type === 'PREVENTIVE').length,
        cost: totalCost.toDecimalPlaces(2),
        lastServiceAt: workOrders[0]?.completedAt ?? null,
      },
    };
  }

  // What the asset is worth on the books on `asOf` (today by default), and
  // how it gets there year by year.
  async valuation(id: string, asOf?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    const day = await this.asOfDay(asOf);
    const input = this.depreciable(asset);
    return {
      asOf: day,
      method: asset.depreciationMethod,
      usefulLifeMonths: asset.usefulLifeMonths,
      salvageValue: asset.salvageValue,
      depreciationStartDate: input?.start ?? null,
      ...this.valued(asset, day),
      schedule: input ? yearlySchedule(input) : [],
    };
  }

  // The register valued: one row per asset, with totals overall and by
  // category. Decommissioned assets are left out unless asked for. An asset
  // with no purchase cost cannot be valued and is counted separately.
  async valuationReport(filters: { organizationId?: string; asOf?: string; includeDecommissioned?: string }) {
    const day = await this.asOfDay(filters.asOf);
    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId: filters.organizationId,
        status: filters.includeDecommissioned === 'true' ? undefined : { not: 'DECOMMISSIONED' },
      },
      orderBy: [{ category: 'asc' }, { assetTag: 'asc' }],
    });

    const rows = assets.map((asset) => ({
      id: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      category: asset.category,
      status: asset.status,
      purchaseDate: asset.purchaseDate,
      method: asset.depreciationMethod,
      ...this.valued(asset, day),
    }));

    const zero = () => ({ count: 0, cost: new Prisma.Decimal(0), accumulatedDepreciation: new Prisma.Decimal(0), bookValue: new Prisma.Decimal(0) });
    const total = zero();
    const byCategory = new Map<string, ReturnType<typeof zero>>();
    for (const row of rows) {
      if (!row.cost) continue;
      const bucket = byCategory.get(row.category) ?? zero();
      byCategory.set(row.category, bucket);
      for (const sum of [total, bucket]) {
        sum.count += 1;
        sum.cost = sum.cost.plus(row.cost);
        sum.accumulatedDepreciation = sum.accumulatedDepreciation.plus(row.accumulatedDepreciation!);
        sum.bookValue = sum.bookValue.plus(row.bookValue!);
      }
    }
    return {
      asOf: day,
      rows,
      totals: {
        ...total,
        notValued: rows.filter((row) => !row.cost).length,
        byCategory: [...byCategory].map(([category, sum]) => ({ category, ...sum })),
      },
    };
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

  private listWhere(filters: AssetFilters): Prisma.AssetWhereInput {
    this.assertEnum(filters.status, STATUSES, 'status');
    this.assertEnum(filters.condition, CONDITIONS, 'condition');
    const search = filters.search?.trim();
    return {
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
    };
  }

  private isoDate(date: Date | null): string {
    return date ? dayString(date) : '';
  }

  // The depreciation inputs, or null when the asset is not being depreciated.
  private depreciable(asset: Asset): Depreciable | null {
    const start = asset.depreciationStartDate ?? asset.purchaseDate;
    if (asset.depreciationMethod === 'NONE' || !asset.purchaseCost || !asset.usefulLifeMonths || !start) return null;
    return {
      method: asset.depreciationMethod,
      cost: asset.purchaseCost,
      salvage: asset.salvageValue ?? new Prisma.Decimal(0),
      lifeMonths: asset.usefulLifeMonths,
      start,
    };
  }

  // Cost, accumulated depreciation and book value on a day. Without a
  // depreciation method the book value is simply the cost; without a cost
  // there is nothing to value.
  private valued(asset: Asset, day: string) {
    const input = this.depreciable(asset);
    if (input) {
      return { cost: input.cost, ...valueAt(input, new Date(`${day}T00:00:00.000Z`)) };
    }
    const cost = asset.purchaseCost;
    return {
      cost,
      monthsElapsed: 0,
      accumulatedDepreciation: cost ? new Prisma.Decimal(0) : null,
      bookValue: cost,
      fullyDepreciated: false,
    };
  }

  private async asOfDay(asOf?: string): Promise<string> {
    if (asOf === undefined || asOf === '') return nowIn((await getSchedule(this.prisma)).timeZone).date;
    if (!isValidDateString(asOf)) throw new BadRequestException('asOf must be a date like 2026-10-24');
    return asOf;
  }

  // The optional columns shared by create and update, validated and converted.
  // Undefined means "leave alone"; null or '' means "clear" where that is allowed.
  private async fields(
    dto: CreateAssetDto | UpdateAssetDto,
    organizationId: string,
    existing?: Pick<Asset, 'purchaseDate' | 'warrantyExpiry' | 'purchaseCost' | 'depreciationMethod' | 'usefulLifeMonths' | 'salvageValue' | 'depreciationStartDate'>,
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

    const purchaseCost = this.amount(dto.purchaseCost, 'purchaseCost');
    if (purchaseCost !== undefined) data.purchaseCost = purchaseCost;
    this.depreciation(dto, data, { bought, purchaseCost, existing });

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

  // A money amount to the cent; null or '' clears it, undefined leaves it.
  private amount(value: number | null | undefined, field: string): Prisma.Decimal | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || (value as unknown) === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException(`${field} must be zero or more`);
    return new Prisma.Decimal(parsed).toDecimalPlaces(2);
  }

  // The depreciation settings, checked against what the asset will look like
  // after this change: once a method is chosen it needs a cost, a life and a
  // start, whichever of those this request touches.
  private depreciation(
    dto: CreateAssetDto | UpdateAssetDto,
    data: Prisma.AssetUncheckedUpdateInput,
    context: {
      bought: Date | null | undefined;
      purchaseCost: Prisma.Decimal | null | undefined;
      existing?: Pick<Asset, 'purchaseCost' | 'depreciationMethod' | 'usefulLifeMonths' | 'salvageValue' | 'depreciationStartDate'>;
    },
  ) {
    const { existing } = context;
    this.assertEnum(dto.depreciationMethod, METHODS, 'depreciationMethod');
    if (dto.depreciationMethod !== undefined) data.depreciationMethod = dto.depreciationMethod as DepreciationMethod;

    let life = existing?.usefulLifeMonths;
    if (dto.usefulLifeMonths !== undefined) {
      const empty = dto.usefulLifeMonths === null || (dto.usefulLifeMonths as unknown) === '';
      const months = Number(dto.usefulLifeMonths);
      if (!empty && (!Number.isInteger(months) || months < 1 || months > MAX_LIFE_MONTHS)) {
        throw new BadRequestException(`usefulLifeMonths must be a whole number from 1 to ${MAX_LIFE_MONTHS}`);
      }
      life = empty ? null : months;
      data.usefulLifeMonths = life;
    }
    const salvage = this.amount(dto.salvageValue, 'salvageValue');
    if (salvage !== undefined) data.salvageValue = salvage;
    const start = this.date(dto.depreciationStartDate, 'depreciationStartDate');
    if (start !== undefined) data.depreciationStartDate = start;

    const method = (dto.depreciationMethod as DepreciationMethod | undefined) ?? existing?.depreciationMethod ?? 'NONE';
    if (method === 'NONE') return;
    const cost = context.purchaseCost === undefined ? existing?.purchaseCost : context.purchaseCost;
    const startsOn = start === undefined ? (existing?.depreciationStartDate ?? context.bought) : (start ?? context.bought);
    const salvaged = salvage === undefined ? existing?.salvageValue : salvage;
    if (!cost) throw new BadRequestException('Depreciation needs a purchase cost');
    if (!life) throw new BadRequestException('Depreciation needs a useful life in months');
    if (!startsOn) throw new BadRequestException('Depreciation needs a start date, or a purchase date to start from');
    if (salvaged && salvaged.gt(cost)) throw new BadRequestException('The salvage value cannot be more than the purchase cost');
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
