import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppraisalCycleStatus, AppraisalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAppraisalCycleDto } from './dto/create-appraisal-cycle.dto';
import { CreateAppraisalDto } from './dto/create-appraisal.dto';
import { SubmitAppraisalReviewDto } from './dto/submit-appraisal-review.dto';
import { UpdateAppraisalCycleStatusDto } from './dto/update-appraisal-cycle-status.dto';

const CYCLE_INCLUDE = { appraisals: { include: { reviewers: true } } };
const APPRAISAL_INCLUDE = { reviewers: true };

// A cycle only moves along these edges. CLOSED is terminal — run a new
// cycle for the next period instead of reopening this one.
const CYCLE_TRANSITIONS: Record<AppraisalCycleStatus, AppraisalCycleStatus[]> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['CLOSED'],
  CLOSED: [],
};

@Injectable()
export class AppraisalsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Cycles ----------------------------------------------------------------

  findAllCycles(filters: { organizationId?: string; status?: AppraisalCycleStatus }) {
    return this.prisma.appraisalCycle.findMany({
      where: { organizationId: filters.organizationId, status: filters.status },
      orderBy: { startDate: 'desc' },
    });
  }

  async findCycle(id: string) {
    const cycle = await this.prisma.appraisalCycle.findUnique({ where: { id }, include: CYCLE_INCLUDE });
    if (!cycle) {
      throw new NotFoundException(`Appraisal cycle ${id} not found`);
    }
    return cycle;
  }

  createCycle(dto: CreateAppraisalCycleDto) {
    return this.prisma.appraisalCycle.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }

  async updateCycleStatus(id: string, dto: UpdateAppraisalCycleStatusDto) {
    const cycle = await this.findCycle(id);
    const allowed = CYCLE_TRANSITIONS[cycle.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move cycle from ${cycle.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    if (dto.status === 'CLOSED') {
      const incomplete = cycle.appraisals.filter((a) => a.status !== 'COMPLETED');
      if (incomplete.length > 0) {
        throw new BadRequestException(
          `Cannot close cycle: ${incomplete.length} appraisal(s) are not yet COMPLETED`,
        );
      }
    }

    return this.prisma.appraisalCycle.update({
      where: { id },
      data: { status: dto.status },
      include: CYCLE_INCLUDE,
    });
  }

  // --- Appraisals --------------------------------------------------------------

  async createAppraisal(cycleId: string, dto: CreateAppraisalDto) {
    const cycle = await this.findCycle(cycleId);
    if (cycle.status === 'CLOSED') {
      throw new BadRequestException('Cannot add an appraisal to a CLOSED cycle');
    }
    if (!dto.reviewers?.length) {
      throw new BadRequestException('At least one reviewer is required');
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    const reviewerIds = dto.reviewers.map((r) => r.employeeId);
    const reviewerEmployees = await this.prisma.employee.findMany({ where: { id: { in: reviewerIds } } });
    const missing = reviewerIds.filter((id) => !reviewerEmployees.some((e) => e.id === id));
    if (missing.length) {
      throw new BadRequestException(`Unknown reviewer employeeId(s): ${missing.join(', ')}`);
    }

    try {
      return await this.prisma.appraisal.create({
        data: {
          organizationId: cycle.organizationId,
          cycleId,
          employeeId: dto.employeeId,
          reviewers: {
            create: dto.reviewers.map((r) => ({ reviewerId: r.employeeId, relationType: r.relationType })),
          },
        },
        include: APPRAISAL_INCLUDE,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An appraisal for this employee already exists in this cycle');
      }
      throw err;
    }
  }

  findAllAppraisals(filters: {
    organizationId?: string;
    cycleId?: string;
    employeeId?: string;
    status?: AppraisalStatus;
  }) {
    return this.prisma.appraisal.findMany({
      where: {
        organizationId: filters.organizationId,
        cycleId: filters.cycleId,
        employeeId: filters.employeeId,
        status: filters.status,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAppraisal(id: string) {
    const appraisal = await this.prisma.appraisal.findUnique({ where: { id }, include: APPRAISAL_INCLUDE });
    if (!appraisal) {
      throw new NotFoundException(`Appraisal ${id} not found`);
    }
    return appraisal;
  }

  // --- 360 reviews ---------------------------------------------------------------

  async submitReview(appraisalId: string, reviewerEmployeeId: string, dto: SubmitAppraisalReviewDto) {
    if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('rating must be an integer between 1 and 5');
    }

    const appraisal = await this.findAppraisal(appraisalId);
    const reviewerRow = appraisal.reviewers.find((r) => r.reviewerId === reviewerEmployeeId);

    if (!reviewerRow) {
      throw new ForbiddenException('You are not an assigned reviewer for this appraisal');
    }
    if (reviewerRow.status === 'SUBMITTED') {
      throw new BadRequestException('You have already submitted your review for this appraisal');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.appraisalReviewer.update({
        where: { id: reviewerRow.id },
        data: { status: 'SUBMITTED', rating: dto.rating, comments: dto.comments, submittedAt: new Date() },
      });

      // Only flip to COMPLETED once every rater on this appraisal has
      // submitted — the same "children drive the parent's state" rule used
      // by Document Control's approvals and Accounting's payments.
      const remaining = await tx.appraisalReviewer.count({
        where: { appraisalId, status: 'PENDING', id: { not: reviewerRow.id } },
      });

      if (remaining === 0) {
        const submitted = await tx.appraisalReviewer.findMany({
          where: { appraisalId },
          select: { rating: true },
        });
        const ratings = submitted.map((r) => r.rating).filter((r): r is number => r != null);
        const average = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

        await tx.appraisal.update({
          where: { id: appraisalId },
          data: { status: 'COMPLETED', overallRating: average },
        });
      } else {
        await tx.appraisal.update({ where: { id: appraisalId }, data: { status: 'IN_PROGRESS' } });
      }

      return tx.appraisal.findUniqueOrThrow({ where: { id: appraisalId }, include: APPRAISAL_INCLUDE });
    });
  }
}
