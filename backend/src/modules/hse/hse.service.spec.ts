import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { HseService } from './hse.service';

describe('HseService', () => {
  let prisma: MockPrisma;
  let service: HseService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new HseService(prisma);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.incident.findMany with the given filters', async () => {
      const incidents = [{ id: 'i1' }];
      prisma.incident.findMany.mockResolvedValue(incidents as never);

      const result = await service.findAll({ organizationId: 'org-1', status: 'REPORTED' });

      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', status: 'REPORTED' }) }),
      );
      expect(result).toEqual(incidents);
    });
  });

  describe('create', () => {
    it('creates the incident under the reporting user', async () => {
      prisma.incident.create.mockResolvedValue({ id: 'i1', status: 'REPORTED' } as never);

      const result = await service.create(
        {
          organizationId: 'org-1',
          title: 'Slip',
          description: 'x',
          type: 'NEAR_MISS',
          severity: 'LOW',
          occurredAt: '2026-01-01T00:00:00.000Z',
        },
        'user-1',
      );

      expect(prisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-1', reportedById: 'user-1' }) }),
      );
      expect(result).toEqual({ id: 'i1', status: 'REPORTED' });
    });
  });

  describe('updateStatus', () => {
    it.each([
      ['REPORTED', 'CORRECTIVE_ACTION'],
      ['UNDER_INVESTIGATION', 'REPORTED'],
      ['CORRECTIVE_ACTION', 'UNDER_INVESTIGATION'],
      ['CLOSED', 'REPORTED'],
    ])('rejects %s -> %s', async (from, to) => {
      prisma.incident.findUnique.mockResolvedValue({ id: 'i1', status: from, correctiveActions: [] } as never);

      await expect(service.updateStatus('i1', { status: to as never })).rejects.toThrow(BadRequestException);
    });

    it('a minor incident can close directly with zero corrective actions', async () => {
      prisma.incident.findUnique.mockResolvedValue({ id: 'i1', status: 'REPORTED', correctiveActions: [] } as never);
      prisma.incident.update.mockResolvedValue({ id: 'i1', status: 'CLOSED' } as never);

      const result = await service.updateStatus('i1', { status: 'CLOSED' });

      expect(result).toEqual({ id: 'i1', status: 'CLOSED' });
    });

    it('blocks CLOSED while any corrective action is not COMPLETED, naming the count', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'i1',
        status: 'CORRECTIVE_ACTION',
        correctiveActions: [{ status: 'COMPLETED' }, { status: 'PENDING' }, { status: 'IN_PROGRESS' }],
      } as never);

      await expect(service.updateStatus('i1', { status: 'CLOSED' })).rejects.toThrow(
        /2 corrective action\(s\) are not yet COMPLETED/,
      );
    });

    it('allows CLOSED once every corrective action is COMPLETED', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'i1',
        status: 'CORRECTIVE_ACTION',
        correctiveActions: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
      } as never);
      prisma.incident.update.mockResolvedValue({ id: 'i1', status: 'CLOSED' } as never);

      const result = await service.updateStatus('i1', { status: 'CLOSED' });

      expect(result).toEqual({ id: 'i1', status: 'CLOSED' });
    });

    it('404s when the incident does not exist', async () => {
      prisma.incident.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('missing', { status: 'CLOSED' as never })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createCorrectiveAction', () => {
    it('404s if the incident does not exist', async () => {
      prisma.incident.findUnique.mockResolvedValue(null);

      await expect(
        service.createCorrectiveAction('missing', {
          description: 'x',
          assignedToId: 'u1',
          dueDate: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates the corrective action once the incident exists', async () => {
      prisma.incident.findUnique.mockResolvedValue({ id: 'i1', correctiveActions: [] } as never);
      prisma.correctiveAction.create.mockResolvedValue({ id: 'a1', status: 'PENDING' } as never);

      const result = await service.createCorrectiveAction('i1', {
        description: 'x',
        assignedToId: 'u1',
        dueDate: '2026-01-01T00:00:00.000Z',
      });

      expect(prisma.correctiveAction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ incidentId: 'i1', description: 'x' }) }),
      );
      expect(result).toEqual({ id: 'a1', status: 'PENDING' });
    });
  });

  describe('listCorrectiveActions', () => {
    it('delegates straight to prisma.correctiveAction.findMany, scoped to the incident', async () => {
      const actions = [{ id: 'a1' }];
      prisma.correctiveAction.findMany.mockResolvedValue(actions as never);

      const result = await service.listCorrectiveActions('i1');

      expect(prisma.correctiveAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { incidentId: 'i1' } }),
      );
      expect(result).toEqual(actions);
    });
  });

  describe('updateCorrectiveAction', () => {
    it('404s when the action belongs to a different incident', async () => {
      prisma.correctiveAction.findUnique.mockResolvedValue({ id: 'a1', incidentId: 'other' } as never);

      await expect(service.updateCorrectiveAction('i1', 'a1', { status: 'COMPLETED' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('stamps completedAt on COMPLETED and clears it otherwise', async () => {
      prisma.correctiveAction.findUnique.mockResolvedValue({ id: 'a1', incidentId: 'i1' } as never);
      prisma.correctiveAction.update.mockResolvedValue({} as never);

      await service.updateCorrectiveAction('i1', 'a1', { status: 'COMPLETED' });
      expect(prisma.correctiveAction.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);

      await service.updateCorrectiveAction('i1', 'a1', { status: 'IN_PROGRESS' });
      expect(prisma.correctiveAction.update.mock.calls[1][0].data.completedAt).toBeNull();
    });

    it('leaves completedAt untouched when status is not part of the update', async () => {
      prisma.correctiveAction.findUnique.mockResolvedValue({ id: 'a1', incidentId: 'i1' } as never);
      prisma.correctiveAction.update.mockResolvedValue({} as never);

      await service.updateCorrectiveAction('i1', 'a1', { description: 'updated' });

      expect(prisma.correctiveAction.update.mock.calls[0][0].data.completedAt).toBeUndefined();
    });

    it('parses a provided dueDate into a Date', async () => {
      prisma.correctiveAction.findUnique.mockResolvedValue({ id: 'a1', incidentId: 'i1' } as never);
      prisma.correctiveAction.update.mockResolvedValue({} as never);

      await service.updateCorrectiveAction('i1', 'a1', { dueDate: '2026-03-01T00:00:00.000Z' });

      expect(prisma.correctiveAction.update.mock.calls[0][0].data.dueDate).toBeInstanceOf(Date);
    });
  });
});
