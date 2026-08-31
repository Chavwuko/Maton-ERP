import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IncidentSeverity, IncidentStatus, IncidentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCorrectiveActionDto } from './dto/create-corrective-action.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateCorrectiveActionDto } from './dto/update-corrective-action.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';

const INCIDENT_INCLUDE = {
  correctiveActions: { orderBy: { dueDate: 'asc' as const } },
  documents: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 } } },
};

// An incident only moves along these edges. CLOSED is terminal — reopen by
// filing a new incident instead. Minor reports (e.g. a near-miss with no
// follow-up needed) can close directly from REPORTED without going through
// an investigation.
const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  REPORTED: ['UNDER_INVESTIGATION', 'CLOSED'],
  UNDER_INVESTIGATION: ['CORRECTIVE_ACTION', 'CLOSED'],
  CORRECTIVE_ACTION: ['CLOSED'],
  CLOSED: [],
};

@Injectable()
export class HseService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: {
    organizationId?: string;
    status?: IncidentStatus;
    type?: IncidentType;
    severity?: IncidentSeverity;
    projectId?: string;
    assetId?: string;
  }) {
    return this.prisma.incident.findMany({
      where: {
        organizationId: filters.organizationId,
        status: filters.status,
        type: filters.type,
        severity: filters.severity,
        projectId: filters.projectId,
        assetId: filters.assetId,
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id }, include: INCIDENT_INCLUDE });
    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    return incident;
  }

  create(dto: CreateIncidentDto, reportedById: string) {
    return this.prisma.incident.create({
      data: {
        organizationId: dto.organizationId,
        projectId: dto.projectId,
        assetId: dto.assetId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        severity: dto.severity,
        occurredAt: new Date(dto.occurredAt),
        location: dto.location,
        reportedById,
      },
    });
  }

  async updateStatus(id: string, dto: UpdateIncidentStatusDto) {
    const incident = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[incident.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move incident from ${incident.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    if (dto.status === 'CLOSED') {
      const openActions = incident.correctiveActions.filter((a) => a.status !== 'COMPLETED');
      if (openActions.length > 0) {
        throw new BadRequestException(
          `Cannot close incident: ${openActions.length} corrective action(s) are not yet COMPLETED`,
        );
      }
    }

    return this.prisma.incident.update({
      where: { id },
      data: { status: dto.status },
      include: INCIDENT_INCLUDE,
    });
  }

  async createCorrectiveAction(incidentId: string, dto: CreateCorrectiveActionDto) {
    await this.findOne(incidentId); // 404s if the incident doesn't exist

    return this.prisma.correctiveAction.create({
      data: {
        incidentId,
        description: dto.description,
        assignedToId: dto.assignedToId,
        dueDate: new Date(dto.dueDate),
      },
    });
  }

  listCorrectiveActions(incidentId: string) {
    return this.prisma.correctiveAction.findMany({
      where: { incidentId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async updateCorrectiveAction(incidentId: string, actionId: string, dto: UpdateCorrectiveActionDto) {
    const action = await this.prisma.correctiveAction.findUnique({ where: { id: actionId } });
    if (!action || action.incidentId !== incidentId) {
      throw new NotFoundException(`Corrective action ${actionId} not found on incident ${incidentId}`);
    }

    return this.prisma.correctiveAction.update({
      where: { id: actionId },
      data: {
        description: dto.description,
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        completedAt: dto.status === 'COMPLETED' ? new Date() : dto.status ? null : undefined,
      },
    });
  }
}
