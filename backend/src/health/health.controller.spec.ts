import { createMockPrisma, MockPrisma } from '../../test/utils/mock-prisma';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let prisma: MockPrisma;
  let controller: HealthController;

  beforeEach(() => {
    prisma = createMockPrisma();
    controller = new HealthController(prisma);
  });

  it('runs a lightweight query to confirm the DB connection, not just that the process is up', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }] as never);

    const result = await controller.check();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('propagates a database failure rather than reporting healthy', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow('connection refused');
  });
});
