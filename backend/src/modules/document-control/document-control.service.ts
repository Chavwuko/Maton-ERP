import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { SubmitForReviewDto } from './dto/submit-for-review.dto';

const DOCUMENT_INCLUDE = {
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    include: { approvals: true },
  },
};

// Only these roles may be assigned as a document reviewer/approver.
const REVIEWER_ROLES = ['document_control', 'admin'];

@Injectable()
export class DocumentControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  findAll(filters: {
    organizationId?: string;
    status?: DocumentStatus;
    departmentId?: string;
    projectId?: string;
    workOrderId?: string;
    invoiceId?: string;
    incidentId?: string;
    employeeId?: string;
  }) {
    return this.prisma.document.findMany({
      where: {
        organizationId: filters.organizationId,
        status: filters.status,
        departmentId: filters.departmentId,
        projectId: filters.projectId,
        workOrderId: filters.workOrderId,
        invoiceId: filters.invoiceId,
        incidentId: filters.incidentId,
        employeeId: filters.employeeId,
      },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: DOCUMENT_INCLUDE,
    });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return document;
  }

  async create(dto: CreateDocumentDto, ownerId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A file is required to create a document');
    }

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          organizationId: dto.organizationId,
          departmentId: dto.departmentId,
          projectId: dto.projectId,
          workOrderId: dto.workOrderId,
          invoiceId: dto.invoiceId,
          incidentId: dto.incidentId,
          employeeId: dto.employeeId,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          ownerId,
          currentVersion: 1,
        },
      });

      const fileKey = this.buildFileKey(dto.organizationId, document.id, 1, file.originalname);
      await this.storage.putObject(fileKey, file.buffer, file.mimetype);

      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber: 1,
          fileKey,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSizeBytes: file.size,
          uploadedById: ownerId,
        },
      });

      return tx.document.findUniqueOrThrow({ where: { id: document.id }, include: DOCUMENT_INCLUDE });
    });
  }

  async addVersion(documentId: string, uploaderId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A file is required to add a version');
    }

    const document = await this.findOne(documentId);
    const nextVersion = document.currentVersion + 1;
    const fileKey = this.buildFileKey(document.organizationId, document.id, nextVersion, file.originalname);
    await this.storage.putObject(fileKey, file.buffer, file.mimetype);

    return this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber: nextVersion,
          fileKey,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSizeBytes: file.size,
          uploadedById: uploaderId,
        },
      });

      // A new revision invalidates whatever review/approval happened on the
      // previous version — it has to go through the workflow again.
      return tx.document.update({
        where: { id: document.id },
        data: { currentVersion: nextVersion, status: 'DRAFT' },
        include: DOCUMENT_INCLUDE,
      });
    });
  }

  async getDownloadUrl(documentId: string, versionId: string) {
    const document = await this.findOne(documentId);
    const version = document.versions.find((v) => v.id === versionId);
    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found on document ${documentId}`);
    }
    return { url: await this.storage.getDownloadUrl(version.fileKey), fileName: version.fileName };
  }

  async submitForReview(documentId: string, dto: SubmitForReviewDto) {
    const document = await this.findOne(documentId);

    if (document.status !== 'DRAFT' && document.status !== 'REJECTED') {
      throw new BadRequestException(
        `Document must be in DRAFT or REJECTED status to submit for review (currently ${document.status})`,
      );
    }
    if (!dto.reviewerIds?.length) {
      throw new BadRequestException('At least one reviewerId is required');
    }

    await this.assertEligibleReviewers(dto.reviewerIds);

    const currentVersion = document.versions.find((v) => v.versionNumber === document.currentVersion)!;

    return this.prisma.$transaction(async (tx) => {
      // Re-submission after a rejection: clear out the old decisions on
      // this version so reviewers see a clean PENDING state again.
      await tx.documentApproval.deleteMany({ where: { documentVersionId: currentVersion.id } });
      await tx.documentApproval.createMany({
        data: dto.reviewerIds.map((reviewerId) => ({
          documentVersionId: currentVersion.id,
          reviewerId,
        })),
      });

      return tx.document.update({
        where: { id: documentId },
        data: { status: 'IN_REVIEW' },
        include: DOCUMENT_INCLUDE,
      });
    });
  }

  async recordDecision(documentId: string, reviewerId: string, dto: ReviewDecisionDto) {
    const document = await this.findOne(documentId);

    if (document.status !== 'IN_REVIEW') {
      throw new BadRequestException(`Document is not awaiting review (currently ${document.status})`);
    }

    const currentVersion = document.versions.find((v) => v.versionNumber === document.currentVersion)!;
    const approval = currentVersion.approvals.find((a) => a.reviewerId === reviewerId);

    if (!approval) {
      throw new ForbiddenException('You are not an assigned reviewer for this document version');
    }
    if (approval.status !== 'PENDING') {
      throw new BadRequestException('You have already recorded a decision for this version');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.documentApproval.update({
        where: { id: approval.id },
        data: { status: dto.status, comment: dto.comment, decidedAt: new Date() },
      });

      if (dto.status === 'REJECTED') {
        return tx.document.update({
          where: { id: documentId },
          data: { status: 'REJECTED' },
          include: DOCUMENT_INCLUDE,
        });
      }

      // Only flip the document to APPROVED once every reviewer on this
      // version has signed off.
      const remaining = await tx.documentApproval.count({
        where: { documentVersionId: currentVersion.id, status: 'PENDING', id: { not: approval.id } },
      });

      return tx.document.update({
        where: { id: documentId },
        data: { status: remaining === 0 ? 'APPROVED' : 'IN_REVIEW' },
        include: DOCUMENT_INCLUDE,
      });
    });
  }

  private buildFileKey(organizationId: string, documentId: string, version: number, fileName: string): string {
    return `documents/${organizationId}/${documentId}/v${version}/${fileName}`;
  }

  private async assertEligibleReviewers(reviewerIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(reviewerIds)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      include: { role: true },
    });

    const foundIds = new Set(users.map((u) => u.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(`Unknown reviewerId(s): ${missing.join(', ')}`);
    }

    const ineligible = users.filter((u) => !u.role || !REVIEWER_ROLES.includes(u.role.name));
    if (ineligible.length) {
      throw new BadRequestException(
        `Reviewers must have the document_control or admin role: ${ineligible.map((u) => u.email).join(', ')}`,
      );
    }
  }
}
