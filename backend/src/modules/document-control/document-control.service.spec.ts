import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { DocumentControlService } from './document-control.service';

function fakeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: 'file.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from('content'),
    size: 7,
    ...overrides,
  } as Express.Multer.File;
}

describe('DocumentControlService', () => {
  let prisma: MockPrisma;
  let storage: jest.Mocked<StorageService>;
  let service: DocumentControlService;

  beforeEach(() => {
    prisma = createMockPrisma();
    storage = { putObject: jest.fn(), getDownloadUrl: jest.fn() } as unknown as jest.Mocked<StorageService>;
    service = new DocumentControlService(prisma, storage);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.document.findMany with the given filters', async () => {
      const documents = [{ id: 'doc-1' }];
      prisma.document.findMany.mockResolvedValue(documents as never);

      const result = await service.findAll({ organizationId: 'org-1', projectId: 'p1' });

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', projectId: 'p1' }) }),
      );
      expect(result).toEqual(documents);
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects with no file', async () => {
      await expect(service.create({ organizationId: 'org-1', title: 't' }, 'user-1', undefined as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uploads the file and creates document + version 1', async () => {
      prisma.document.create.mockResolvedValue({ id: 'doc-1' } as never);
      prisma.documentVersion.create.mockResolvedValue({} as never);
      prisma.document.findUniqueOrThrow.mockResolvedValue({ id: 'doc-1', currentVersion: 1 } as never);

      const result = await service.create({ organizationId: 'org-1', title: 't' }, 'user-1', fakeFile());

      expect(storage.putObject).toHaveBeenCalledWith(
        'documents/org-1/doc-1/v1/file.txt',
        expect.any(Buffer),
        'text/plain',
      );
      expect(result).toEqual({ id: 'doc-1', currentVersion: 1 });
    });
  });

  describe('addVersion', () => {
    it('rejects with no file', async () => {
      await expect(service.addVersion('doc-1', 'user-1', undefined as never)).rejects.toThrow(BadRequestException);
    });

    it('increments the version and resets status to DRAFT', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        organizationId: 'org-1',
        currentVersion: 1,
      } as never);
      prisma.documentVersion.create.mockResolvedValue({} as never);
      prisma.document.update.mockResolvedValue({ id: 'doc-1', currentVersion: 2, status: 'DRAFT' } as never);

      const result = await service.addVersion('doc-1', 'user-1', fakeFile({ originalname: 'v2.txt' }));

      expect(storage.putObject).toHaveBeenCalledWith('documents/org-1/doc-1/v2/v2.txt', expect.any(Buffer), 'text/plain');
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentVersion: 2, status: 'DRAFT' } }),
      );
      expect(result).toEqual({ id: 'doc-1', currentVersion: 2, status: 'DRAFT' });
    });
  });

  describe('submitForReview', () => {
    const baseDocument = {
      id: 'doc-1',
      status: 'DRAFT',
      currentVersion: 1,
      versions: [{ id: 'v1', versionNumber: 1, approvals: [] }],
    };

    it('rejects when the document is not DRAFT/REJECTED', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...baseDocument, status: 'APPROVED' } as never);

      await expect(service.submitForReview('doc-1', { reviewerIds: ['u1'] })).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty reviewerIds list', async () => {
      prisma.document.findUnique.mockResolvedValue(baseDocument as never);

      await expect(service.submitForReview('doc-1', { reviewerIds: [] })).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown reviewerId, naming it', async () => {
      prisma.document.findUnique.mockResolvedValue(baseDocument as never);
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.submitForReview('doc-1', { reviewerIds: ['ghost'] })).rejects.toThrow(
        /Unknown reviewerId\(s\): ghost/,
      );
    });

    it('rejects a reviewer without the document_control/admin role, naming their email', async () => {
      prisma.document.findUnique.mockResolvedValue(baseDocument as never);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'finance@local.dev', role: { name: 'finance' } },
      ] as never);

      await expect(service.submitForReview('doc-1', { reviewerIds: ['u1'] })).rejects.toThrow(
        /finance@local\.dev/,
      );
    });

    it('rejects a reviewer with no role at all', async () => {
      prisma.document.findUnique.mockResolvedValue(baseDocument as never);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'norole@local.dev', role: null }] as never);

      await expect(service.submitForReview('doc-1', { reviewerIds: ['u1'] })).rejects.toThrow(BadRequestException);
    });

    it('succeeds with an eligible reviewer and moves the document to IN_REVIEW', async () => {
      prisma.document.findUnique.mockResolvedValue(baseDocument as never);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'admin@local.dev', role: { name: 'admin' } },
      ] as never);
      prisma.documentApproval.deleteMany.mockResolvedValue({ count: 0 } as never);
      prisma.documentApproval.createMany.mockResolvedValue({ count: 1 } as never);
      prisma.document.update.mockResolvedValue({ id: 'doc-1', status: 'IN_REVIEW' } as never);

      const result = await service.submitForReview('doc-1', { reviewerIds: ['u1'] });

      expect(prisma.documentApproval.createMany).toHaveBeenCalledWith({
        data: [{ documentVersionId: 'v1', reviewerId: 'u1' }],
      });
      expect(result).toEqual({ id: 'doc-1', status: 'IN_REVIEW' });
    });
  });

  describe('recordDecision', () => {
    const inReviewDocument = {
      id: 'doc-1',
      status: 'IN_REVIEW',
      currentVersion: 1,
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          approvals: [
            { id: 'appr-1', reviewerId: 'u1', status: 'PENDING' },
            { id: 'appr-2', reviewerId: 'u2', status: 'PENDING' },
          ],
        },
      ],
    };

    it('rejects when the document is not IN_REVIEW', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...inReviewDocument, status: 'DRAFT' } as never);

      await expect(service.recordDecision('doc-1', 'u1', { status: 'APPROVED' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a non-assigned reviewer with ForbiddenException', async () => {
      prisma.document.findUnique.mockResolvedValue(inReviewDocument as never);

      await expect(service.recordDecision('doc-1', 'stranger', { status: 'APPROVED' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a reviewer who already decided', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...inReviewDocument,
        versions: [{ ...inReviewDocument.versions[0], approvals: [{ id: 'appr-1', reviewerId: 'u1', status: 'APPROVED' }] }],
      } as never);

      await expect(service.recordDecision('doc-1', 'u1', { status: 'APPROVED' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('REJECTED flips the document straight to REJECTED', async () => {
      prisma.document.findUnique.mockResolvedValue(inReviewDocument as never);
      prisma.documentApproval.update.mockResolvedValue({} as never);
      prisma.document.update.mockResolvedValue({ id: 'doc-1', status: 'REJECTED' } as never);

      const result = await service.recordDecision('doc-1', 'u1', { status: 'REJECTED' });

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REJECTED' } }),
      );
      expect(result).toEqual({ id: 'doc-1', status: 'REJECTED' });
    });

    it('APPROVED with another reviewer still PENDING keeps the document IN_REVIEW', async () => {
      prisma.document.findUnique.mockResolvedValue(inReviewDocument as never);
      prisma.documentApproval.update.mockResolvedValue({} as never);
      prisma.documentApproval.count.mockResolvedValue(1); // u2 still pending
      prisma.document.update.mockResolvedValue({ id: 'doc-1', status: 'IN_REVIEW' } as never);

      await service.recordDecision('doc-1', 'u1', { status: 'APPROVED' });

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'IN_REVIEW' } }),
      );
    });

    it('APPROVED with no reviewers left pending flips the document to APPROVED', async () => {
      prisma.document.findUnique.mockResolvedValue(inReviewDocument as never);
      prisma.documentApproval.update.mockResolvedValue({} as never);
      prisma.documentApproval.count.mockResolvedValue(0);
      prisma.document.update.mockResolvedValue({ id: 'doc-1', status: 'APPROVED' } as never);

      await service.recordDecision('doc-1', 'u1', { status: 'APPROVED' });

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'APPROVED' } }),
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('404s when the version does not belong to the document', async () => {
      prisma.document.findUnique.mockResolvedValue({ id: 'doc-1', versions: [{ id: 'v1' }] } as never);

      await expect(service.getDownloadUrl('doc-1', 'nope')).rejects.toThrow('Version nope not found on document doc-1');
    });

    it('returns a presigned URL for a valid version', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        versions: [{ id: 'v1', fileKey: 'documents/org-1/doc-1/v1/file.txt', fileName: 'file.txt' }],
      } as never);
      storage.getDownloadUrl.mockResolvedValue('https://minio/presigned-url');

      const result = await service.getDownloadUrl('doc-1', 'v1');

      expect(storage.getDownloadUrl).toHaveBeenCalledWith('documents/org-1/doc-1/v1/file.txt');
      expect(result).toEqual({ url: 'https://minio/presigned-url', fileName: 'file.txt' });
    });
  });
});
