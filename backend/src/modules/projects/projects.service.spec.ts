import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { ProjectsService } from './projects.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.20.0',
  });
}

describe('ProjectsService', () => {
  let prisma: MockPrisma;
  let service: ProjectsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ProjectsService(prisma);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.project.findMany with the given filters', async () => {
      const projects = [{ id: 'p1' }];
      prisma.project.findMany.mockResolvedValue(projects as never);

      const result = await service.findAll({ organizationId: 'org-1', status: 'ACTIVE' });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'ACTIVE' } }),
      );
      expect(result).toEqual(projects);
    });
  });

  describe('create', () => {
    it('turns a P2002 conflict into a ConflictException naming the code', async () => {
      prisma.project.create.mockRejectedValue(p2002());

      await expect(
        service.create({ organizationId: 'org-1', code: 'PRJ-001', name: 'Dup' }),
      ).rejects.toThrow(/PRJ-001/);
    });

    it('rethrows any other error untouched', async () => {
      prisma.project.create.mockRejectedValue(new Error('boom'));

      await expect(service.create({ organizationId: 'org-1', code: 'PRJ-001', name: 'X' })).rejects.toThrow(
        'boom',
      );
    });

    it('parses provided startDate/endDate into Dates', async () => {
      prisma.project.create.mockResolvedValue({ id: 'p1' } as never);

      await service.create({
        organizationId: 'org-1',
        code: 'PRJ-001',
        name: 'X',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
      });

      const data = prisma.project.create.mock.calls[0][0].data;
      expect(data.startDate).toBeInstanceOf(Date);
      expect(data.endDate).toBeInstanceOf(Date);
    });
  });

  describe('updateStatus', () => {
    it.each([
      ['PLANNED', 'ON_HOLD'],
      ['CLOSED', 'ACTIVE'],
      ['CLOSED', 'PLANNED'],
    ])('rejects %s -> %s', async (from, to) => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: from } as never);

      await expect(service.updateStatus('p1', { status: to as never })).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['PLANNED', 'ACTIVE'],
      ['ACTIVE', 'ON_HOLD'],
      ['ACTIVE', 'CLOSED'],
      ['ON_HOLD', 'ACTIVE'],
      ['ON_HOLD', 'CLOSED'],
    ])('allows %s -> %s', async (from, to) => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: from } as never);
      prisma.project.update.mockResolvedValue({ id: 'p1', status: to } as never);

      const result = await service.updateStatus('p1', { status: to as never });

      expect(result).toEqual({ id: 'p1', status: to });
    });

    it('names the terminal status explicitly when there are no allowed transitions', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: 'CLOSED' } as never);

      await expect(service.updateStatus('p1', { status: 'ACTIVE' as never })).rejects.toThrow(/terminal status/);
    });

    it('404s when the project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('missing', { status: 'ACTIVE' as never })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createMilestone', () => {
    it('404s if the project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.createMilestone('missing', { name: 'M', dueDate: '2026-01-01T00:00:00.000Z' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates the milestone once the project exists', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' } as never);
      prisma.projectMilestone.create.mockResolvedValue({ id: 'm1', name: 'M' } as never);

      const result = await service.createMilestone('p1', { name: 'M', dueDate: '2026-01-01T00:00:00.000Z' });

      expect(prisma.projectMilestone.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: 'p1', name: 'M' }) }),
      );
      expect(result).toEqual({ id: 'm1', name: 'M' });
    });
  });

  describe('listMilestones', () => {
    it('delegates straight to prisma.projectMilestone.findMany, scoped to the project', async () => {
      const milestones = [{ id: 'm1' }];
      prisma.projectMilestone.findMany.mockResolvedValue(milestones as never);

      const result = await service.listMilestones('p1');

      expect(prisma.projectMilestone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'p1' } }),
      );
      expect(result).toEqual(milestones);
    });
  });

  describe('updateMilestone', () => {
    it('404s when the milestone belongs to a different project', async () => {
      prisma.projectMilestone.findUnique.mockResolvedValue({ id: 'm1', projectId: 'other-project' } as never);

      await expect(service.updateMilestone('p1', 'm1', { status: 'COMPLETED' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('stamps completedAt when status is set to COMPLETED', async () => {
      prisma.projectMilestone.findUnique.mockResolvedValue({ id: 'm1', projectId: 'p1' } as never);
      prisma.projectMilestone.update.mockResolvedValue({} as never);

      await service.updateMilestone('p1', 'm1', { status: 'COMPLETED' });

      const call = prisma.projectMilestone.update.mock.calls[0][0];
      expect(call.data.status).toBe('COMPLETED');
      expect(call.data.completedAt).toBeInstanceOf(Date);
    });

    it('clears completedAt when status is set to anything other than COMPLETED', async () => {
      prisma.projectMilestone.findUnique.mockResolvedValue({ id: 'm1', projectId: 'p1' } as never);
      prisma.projectMilestone.update.mockResolvedValue({} as never);

      await service.updateMilestone('p1', 'm1', { status: 'PENDING' });

      const call = prisma.projectMilestone.update.mock.calls[0][0];
      expect(call.data.completedAt).toBeNull();
    });

    it('leaves completedAt untouched when status is not part of the update', async () => {
      prisma.projectMilestone.findUnique.mockResolvedValue({ id: 'm1', projectId: 'p1' } as never);
      prisma.projectMilestone.update.mockResolvedValue({} as never);

      await service.updateMilestone('p1', 'm1', { description: 'new description' });

      const call = prisma.projectMilestone.update.mock.calls[0][0];
      expect(call.data.completedAt).toBeUndefined();
    });

    it('parses a provided dueDate into a Date', async () => {
      prisma.projectMilestone.findUnique.mockResolvedValue({ id: 'm1', projectId: 'p1' } as never);
      prisma.projectMilestone.update.mockResolvedValue({} as never);

      await service.updateMilestone('p1', 'm1', { dueDate: '2026-02-01T00:00:00.000Z' });

      const call = prisma.projectMilestone.update.mock.calls[0][0];
      expect(call.data.dueDate).toBeInstanceOf(Date);
    });
  });
});
