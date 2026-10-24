import { BadRequestException, Logger } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  let prisma: MockPrisma;
  let service: ActivityService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ActivityService(prisma);
  });

  describe('record', () => {
    it('writes the entry', async () => {
      const entry = { userId: 'u1', action: 'PURCHASE', entityType: 'Purchase', entityId: 'p1', metadata: { summary: 'x' } };

      await service.record(entry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: entry });
    });

    it('swallows a write failure rather than breaking the request it describes', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      prisma.auditLog.create.mockRejectedValue(new Error('db down'));

      await expect(service.record({ action: 'X', entityType: 'Y', entityId: '' })).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith('Could not record X: db down');
      warn.mockRestore();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.auditLog.findMany.mockResolvedValue([] as never);
    });

    it('returns the newest 200 by default, with who did it', async () => {
      await service.list({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: undefined, action: undefined, entityType: undefined, createdAt: undefined },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    });

    it('filters by user, action and type, and a date range that includes the whole last day', async () => {
      await service.list({ userId: 'u1', action: 'ISSUE', entityType: 'Consumption', from: '2026-10-01', to: '2026-10-31', limit: '50' });

      const args = prisma.auditLog.findMany.mock.calls[0][0]!;
      expect(args.where).toMatchObject({ userId: 'u1', action: 'ISSUE', entityType: 'Consumption' });
      expect(args.where!.createdAt).toEqual({
        gte: new Date('2026-10-01'),
        lte: new Date('2026-10-31T23:59:59.999Z'),
      });
      expect(args.take).toBe(50);
    });

    it('accepts a range with only one end', async () => {
      await service.list({ from: '2026-10-01' });
      await service.list({ to: '2026-10-31' });

      const ranges = prisma.auditLog.findMany.mock.calls.map(([arg]) => arg!.where!.createdAt);
      expect(ranges[0]).toEqual({ gte: new Date('2026-10-01'), lte: undefined });
      expect(ranges[1]).toEqual({ gte: undefined, lte: new Date('2026-10-31T23:59:59.999Z') });
    });

    it.each(['0', '501', '1.5', 'many'])('rejects the limit %s', (limit) => {
      expect(() => service.list({ limit })).toThrow('limit must be a whole number from 1 to 500');
    });

    it('rejects malformed dates', () => {
      expect(() => service.list({ from: 'soon' })).toThrow(BadRequestException);
      expect(() => service.list({ to: 'later' })).toThrow('from and to must be dates');
    });
  });
});

describe('ActivityController', () => {
  it('passes every filter to the service', () => {
    const service = { list: jest.fn() } as unknown as jest.Mocked<ActivityService>;
    const controller = new ActivityController(service);

    controller.list('u1', 'ISSUE', 'Consumption', '2026-10-01', '2026-10-31', '10');

    expect(service.list).toHaveBeenCalledWith({
      userId: 'u1',
      action: 'ISSUE',
      entityType: 'Consumption',
      from: '2026-10-01',
      to: '2026-10-31',
      limit: '10',
    });
  });
});
