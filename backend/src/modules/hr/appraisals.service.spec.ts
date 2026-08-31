import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { AppraisalsService } from './appraisals.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' });
}

describe('AppraisalsService', () => {
  let prisma: MockPrisma;
  let service: AppraisalsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AppraisalsService(prisma);
  });

  describe('findAllCycles', () => {
    it('delegates straight to prisma.appraisalCycle.findMany with the given filters', async () => {
      const cycles = [{ id: 'c1' }];
      prisma.appraisalCycle.findMany.mockResolvedValue(cycles as never);

      const result = await service.findAllCycles({ organizationId: 'org-1', status: 'ACTIVE' });

      expect(prisma.appraisalCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'ACTIVE' } }),
      );
      expect(result).toEqual(cycles);
    });
  });

  describe('findCycle', () => {
    it('404s when missing', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(null);

      await expect(service.findCycle('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCycle', () => {
    it('creates the cycle with parsed start/end dates', async () => {
      prisma.appraisalCycle.create.mockResolvedValue({ id: 'c1', name: 'H1 2026' } as never);

      const result = await service.createCycle({
        organizationId: 'org-1',
        name: 'H1 2026',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      });

      expect(prisma.appraisalCycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1', name: 'H1 2026' }),
        }),
      );
      expect(result).toEqual({ id: 'c1', name: 'H1 2026' });
    });
  });

  describe('findAllAppraisals', () => {
    it('delegates straight to prisma.appraisal.findMany with the given filters', async () => {
      const appraisals = [{ id: 'appr-1' }];
      prisma.appraisal.findMany.mockResolvedValue(appraisals as never);

      const result = await service.findAllAppraisals({ organizationId: 'org-1', cycleId: 'c1' });

      expect(prisma.appraisal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', cycleId: 'c1' }) }),
      );
      expect(result).toEqual(appraisals);
    });
  });

  describe('findAppraisal', () => {
    it('404s when missing', async () => {
      prisma.appraisal.findUnique.mockResolvedValue(null);

      await expect(service.findAppraisal('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAppraisal', () => {
    const openCycle = { id: 'cycle-1', organizationId: 'org-1', status: 'DRAFT', appraisals: [] };

    it('rejects adding to a CLOSED cycle', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue({ ...openCycle, status: 'CLOSED' } as never);

      await expect(
        service.createAppraisal('cycle-1', { employeeId: 'e1', reviewers: [{ employeeId: 'e1', relationType: 'SELF' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty reviewers list', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(openCycle as never);

      await expect(service.createAppraisal('cycle-1', { employeeId: 'e1', reviewers: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s when the subject employee does not exist', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(openCycle as never);
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.createAppraisal('cycle-1', {
          employeeId: 'missing',
          reviewers: [{ employeeId: 'e1', relationType: 'SELF' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown reviewer employeeId, naming it', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(openCycle as never);
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);
      prisma.employee.findMany.mockResolvedValue([]); // none of the reviewer ids resolved

      await expect(
        service.createAppraisal('cycle-1', {
          employeeId: 'e1',
          reviewers: [{ employeeId: 'ghost', relationType: 'PEER' }],
        }),
      ).rejects.toThrow(/Unknown reviewer employeeId\(s\): ghost/);
    });

    it('turns a P2002 conflict into a ConflictException', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(openCycle as never);
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);
      prisma.employee.findMany.mockResolvedValue([{ id: 'e1' }] as never);
      prisma.appraisal.create.mockRejectedValue(p2002());

      await expect(
        service.createAppraisal('cycle-1', {
          employeeId: 'e1',
          reviewers: [{ employeeId: 'e1', relationType: 'SELF' }],
        }),
      ).rejects.toThrow(/already exists in this cycle/);
    });

    it('creates the appraisal with one reviewer row per entry', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(openCycle as never);
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);
      prisma.employee.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'mgr' }] as never);
      prisma.appraisal.create.mockResolvedValue({ id: 'appr-1', status: 'PENDING' } as never);

      const result = await service.createAppraisal('cycle-1', {
        employeeId: 'e1',
        reviewers: [
          { employeeId: 'e1', relationType: 'SELF' },
          { employeeId: 'mgr', relationType: 'MANAGER' },
        ],
      });

      expect(prisma.appraisal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            reviewers: {
              create: [
                { reviewerId: 'e1', relationType: 'SELF' },
                { reviewerId: 'mgr', relationType: 'MANAGER' },
              ],
            },
          }),
        }),
      );
      expect(result).toEqual({ id: 'appr-1', status: 'PENDING' });
    });

    it('rethrows unrelated errors', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue(openCycle as never);
      prisma.employee.findUnique.mockResolvedValue({ id: 'e1' } as never);
      prisma.employee.findMany.mockResolvedValue([{ id: 'e1' }] as never);
      prisma.appraisal.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createAppraisal('cycle-1', {
          employeeId: 'e1',
          reviewers: [{ employeeId: 'e1', relationType: 'SELF' }],
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('updateCycleStatus', () => {
    it('rejects ACTIVE -> DRAFT (no backward transition)', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', appraisals: [] } as never);

      await expect(service.updateCycleStatus('c1', { status: 'DRAFT' as never })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects any transition once CLOSED (terminal)', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue({ id: 'c1', status: 'CLOSED', appraisals: [] } as never);

      await expect(service.updateCycleStatus('c1', { status: 'ACTIVE' })).rejects.toThrow(/terminal status/);
    });

    it('blocks CLOSED while any appraisal is not COMPLETED, naming the count', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'ACTIVE',
        appraisals: [{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }, { status: 'PENDING' }],
      } as never);

      await expect(service.updateCycleStatus('c1', { status: 'CLOSED' })).rejects.toThrow(
        /2 appraisal\(s\) are not yet COMPLETED/,
      );
    });

    it('allows CLOSED once every appraisal is COMPLETED', async () => {
      prisma.appraisalCycle.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'ACTIVE',
        appraisals: [{ status: 'COMPLETED' }],
      } as never);
      prisma.appraisalCycle.update.mockResolvedValue({ id: 'c1', status: 'CLOSED' } as never);

      const result = await service.updateCycleStatus('c1', { status: 'CLOSED' });

      expect(result).toEqual({ id: 'c1', status: 'CLOSED' });
    });
  });

  describe('submitReview', () => {
    const appraisalWithReviewers = (reviewers: Array<{ id: string; reviewerId: string; status: string }>) => ({
      id: 'appr-1',
      status: 'IN_PROGRESS',
      reviewers,
    });

    it.each([0, 6, 3.5])('rejects an out-of-range or non-integer rating (%s)', async (rating) => {
      await expect(service.submitReview('appr-1', 'e1', { rating })).rejects.toThrow(BadRequestException);
    });

    it('rejects an employee not assigned as a reviewer', async () => {
      prisma.appraisal.findUnique.mockResolvedValue(
        appraisalWithReviewers([{ id: 'r1', reviewerId: 'someone-else', status: 'PENDING' }]) as never,
      );

      await expect(service.submitReview('appr-1', 'e1', { rating: 3 })).rejects.toThrow(ForbiddenException);
    });

    it('rejects a reviewer who already submitted', async () => {
      prisma.appraisal.findUnique.mockResolvedValue(
        appraisalWithReviewers([{ id: 'r1', reviewerId: 'e1', status: 'SUBMITTED' }]) as never,
      );

      await expect(service.submitReview('appr-1', 'e1', { rating: 3 })).rejects.toThrow(BadRequestException);
    });

    it('stays IN_PROGRESS while other reviewers are still pending, and does not compute an average', async () => {
      prisma.appraisal.findUnique.mockResolvedValue(
        appraisalWithReviewers([
          { id: 'r1', reviewerId: 'e1', status: 'PENDING' },
          { id: 'r2', reviewerId: 'e2', status: 'PENDING' },
        ]) as never,
      );
      prisma.appraisalReviewer.update.mockResolvedValue({} as never);
      prisma.appraisalReviewer.count.mockResolvedValue(1); // r2 still pending
      prisma.appraisal.update.mockResolvedValue({} as never);
      prisma.appraisal.findUniqueOrThrow.mockResolvedValue({ id: 'appr-1', status: 'IN_PROGRESS' } as never);

      const result = await service.submitReview('appr-1', 'e1', { rating: 4 });

      expect(prisma.appraisal.update).toHaveBeenCalledWith({ where: { id: 'appr-1' }, data: { status: 'IN_PROGRESS' } });
      expect(prisma.appraisalReviewer.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'appr-1', status: 'IN_PROGRESS' });
    });

    it('completes and averages every rating once the last reviewer submits', async () => {
      prisma.appraisal.findUnique.mockResolvedValue(
        appraisalWithReviewers([{ id: 'r1', reviewerId: 'e1', status: 'PENDING' }]) as never,
      );
      prisma.appraisalReviewer.update.mockResolvedValue({} as never);
      prisma.appraisalReviewer.count.mockResolvedValue(0);
      prisma.appraisalReviewer.findMany.mockResolvedValue([
        { rating: 4 },
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
      ] as never);
      prisma.appraisal.update.mockResolvedValue({} as never);
      prisma.appraisal.findUniqueOrThrow.mockResolvedValue({ id: 'appr-1', status: 'COMPLETED', overallRating: 4 } as never);

      const result = await service.submitReview('appr-1', 'e1', { rating: 3 });

      expect(prisma.appraisal.update).toHaveBeenCalledWith({
        where: { id: 'appr-1' },
        data: { status: 'COMPLETED', overallRating: 4 },
      });
      expect(result).toEqual({ id: 'appr-1', status: 'COMPLETED', overallRating: 4 });
    });
  });
});
