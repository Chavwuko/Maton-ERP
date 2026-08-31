import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetStatus, Prisma, WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';

const WORK_ORDER_INCLUDE = {
  documents: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 } } },
};

// A work order only moves along these edges. COMPLETED/CANCELLED are
// terminal — reopen by creating a new work order instead.
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Work order statuses that still represent active work against the asset.
const ACTIVE_STATUSES: WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: {
    organizationId?: string;
    assetId?: string;
    status?: WorkOrderStatus;
    type?: WorkOrderType;
    priority?: WorkOrderPriority;
  }) {
    return this.prisma.workOrder.findMany({
      where: {
        organizationId: filters.organizationId,
        assetId: filters.assetId,
        status: filters.status,
        type: filters.type,
        priority: filters.priority,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: WORK_ORDER_INCLUDE,
    });
    if (!workOrder) {
      throw new NotFoundException(`Work order ${id} not found`);
    }
    return workOrder;
  }

  async create(dto: CreateWorkOrderDto, requestedById: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) {
      throw new NotFoundException(`Asset ${dto.assetId} not found`);
    }
    if (asset.status === 'DECOMMISSIONED') {
      throw new BadRequestException('Cannot open a work order against a decommissioned asset');
    }

    return this.prisma.workOrder.create({
      data: {
        organizationId: dto.organizationId,
        assetId: dto.assetId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedToId: dto.assignedToId,
        requestedById,
      },
    });
  }

  async assign(id: string, dto: AssignWorkOrderDto) {
    await this.findOne(id);
    return this.prisma.workOrder.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
      include: WORK_ORDER_INCLUDE,
    });
  }

  async updateStatus(id: string, dto: UpdateWorkOrderStatusDto) {
    const workOrder = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[workOrder.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move work order from ${workOrder.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          status: dto.status,
          completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        },
        include: WORK_ORDER_INCLUDE,
      });

      await this.syncAssetStatus(tx, workOrder.assetId, dto.status);

      return updated;
    });
  }

  // Keeps Asset.status truthful without a manual step: a work order going
  // active takes the asset down; the asset only comes back up once no other
  // work order against it is still active.
  private async syncAssetStatus(
    tx: Prisma.TransactionClient,
    assetId: string,
    newStatus: WorkOrderStatus,
  ): Promise<void> {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
    if (asset.status === AssetStatus.DECOMMISSIONED) {
      return;
    }

    if (newStatus === 'IN_PROGRESS') {
      if (asset.status !== AssetStatus.UNDER_MAINTENANCE) {
        await tx.asset.update({ where: { id: assetId }, data: { status: AssetStatus.UNDER_MAINTENANCE } });
      }
      return;
    }

    if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
      const stillActive = await tx.workOrder.count({
        where: { assetId, status: { in: ACTIVE_STATUSES } },
      });
      if (stillActive === 0 && asset.status === AssetStatus.UNDER_MAINTENANCE) {
        await tx.asset.update({ where: { id: assetId }, data: { status: AssetStatus.ACTIVE } });
      }
    }
  }
}
