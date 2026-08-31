import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MilestoneStatus, Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';

const PROJECT_INCLUDE = {
  milestones: { orderBy: { dueDate: 'asc' as const } },
  documents: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 } } },
};

// A project only moves along these edges. CLOSED is terminal — a closed
// project can't be reopened by design; create a new one instead.
const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNED: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['ON_HOLD', 'CLOSED'],
  ON_HOLD: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { organizationId?: string; status?: ProjectStatus }) {
    return this.prisma.project.findMany({
      where: { organizationId: filters.organizationId, status: filters.status },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async create(dto: CreateProjectDto) {
    try {
      return await this.prisma.project.create({
        data: {
          organizationId: dto.organizationId,
          code: dto.code,
          name: dto.name,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          budget: dto.budget,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Project code "${dto.code}" already exists in this organization`);
      }
      throw err;
    }
  }

  async updateStatus(id: string, dto: UpdateProjectStatusDto) {
    const project = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[project.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move project from ${project.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: { status: dto.status },
      include: PROJECT_INCLUDE,
    });
  }

  async createMilestone(projectId: string, dto: CreateMilestoneDto) {
    await this.findOne(projectId); // 404s if the project doesn't exist

    return this.prisma.projectMilestone.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        dueDate: new Date(dto.dueDate),
      },
    });
  }

  listMilestones(projectId: string) {
    return this.prisma.projectMilestone.findMany({
      where: { projectId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async updateMilestone(projectId: string, milestoneId: string, dto: UpdateMilestoneDto) {
    const milestone = await this.prisma.projectMilestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.projectId !== projectId) {
      throw new NotFoundException(`Milestone ${milestoneId} not found on project ${projectId}`);
    }

    return this.prisma.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        name: dto.name,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        completedAt: dto.status === MilestoneStatus.COMPLETED ? new Date() : dto.status ? null : undefined,
      },
    });
  }
}
