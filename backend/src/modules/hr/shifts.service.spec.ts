import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { ShiftsService } from './shifts.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' });
}

describe('ShiftsService', () => {
  let prisma: MockPrisma;
  let service: ShiftsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ShiftsService(prisma);
  });

  describe('findAll', () => {
    it('filters by organizationId when given', async () => {
      prisma.shift.findMany.mockResolvedValue([] as never);

      await service.findAll({ organizationId: 'org-1' });

      expect(prisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.shift.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the shift when found', async () => {
      prisma.shift.findUnique.mockResolvedValue({ id: 'shift-1', name: 'Morning' } as never);

      await expect(service.findOne('shift-1')).resolves.toEqual({ id: 'shift-1', name: 'Morning' });
    });
  });

  describe('create', () => {
    it('creates a shift, defaulting breakMinutes to 0', async () => {
      prisma.shift.create.mockResolvedValue({ id: 'shift-1' } as never);

      await service.create({ organizationId: 'org-1', name: 'Morning', startTime: '09:00', endTime: '17:00' });

      expect(prisma.shift.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Morning',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
        },
      });
    });

    it('409s on a duplicate name within the organization', async () => {
      prisma.shift.create.mockRejectedValue(p2002());

      await expect(
        service.create({ organizationId: 'org-1', name: 'Morning', startTime: '09:00', endTime: '17:00' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated errors', async () => {
      prisma.shift.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({ organizationId: 'org-1', name: 'Morning', startTime: '09:00', endTime: '17:00' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('update', () => {
    it('404s when the shift does not exist', async () => {
      prisma.shift.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('updates the given fields', async () => {
      prisma.shift.findUnique.mockResolvedValue({ id: 'shift-1' } as never);
      prisma.shift.update.mockResolvedValue({ id: 'shift-1', name: 'Evening' } as never);

      await service.update('shift-1', { name: 'Evening', breakMinutes: 30 });

      expect(prisma.shift.update).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
        data: { name: 'Evening', startTime: undefined, endTime: undefined, breakMinutes: 30 },
      });
    });

    it('409s on a rename that collides with another shift', async () => {
      prisma.shift.findUnique.mockResolvedValue({ id: 'shift-1' } as never);
      prisma.shift.update.mockRejectedValue(p2002());

      await expect(service.update('shift-1', { name: 'Evening' })).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated errors from update', async () => {
      prisma.shift.findUnique.mockResolvedValue({ id: 'shift-1' } as never);
      prisma.shift.update.mockRejectedValue(new Error('boom'));

      await expect(service.update('shift-1', { name: 'Evening' })).rejects.toThrow('boom');
    });
  });
});
