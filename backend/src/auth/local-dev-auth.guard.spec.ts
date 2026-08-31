import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMockPrisma, MockPrisma } from '../../test/utils/mock-prisma';
import { LocalDevAuthGuard } from './local-dev-auth.guard';

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('LocalDevAuthGuard', () => {
  let prisma: MockPrisma;
  let reflector: jest.Mocked<Reflector>;
  let guard: LocalDevAuthGuard;

  beforeEach(() => {
    prisma = createMockPrisma();
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new LocalDevAuthGuard(prisma, reflector);
  });

  it('allows @Public() routes without touching the database', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(prisma.role.upsert).not.toHaveBeenCalled();
  });

  it('defaults to the admin role when no x-local-role header is sent', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.role.upsert.mockResolvedValue({ id: 'role-1', name: 'admin' } as never);
    prisma.user.upsert.mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'local-dev|admin',
      email: 'admin@local.dev',
      departmentId: null,
    } as never);
    const req = { headers: {} };

    await guard.canActivate(contextFor(req));

    expect(prisma.role.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'admin' } }));
    expect(req).toHaveProperty('user', {
      id: 'user-1',
      cognitoSub: 'local-dev|admin',
      email: 'admin@local.dev',
      roleName: 'admin',
      departmentId: null,
    });
  });

  it('honors a custom x-local-role header end to end', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.role.upsert.mockResolvedValue({ id: 'role-2', name: 'hse' } as never);
    prisma.user.upsert.mockResolvedValue({
      id: 'user-2',
      cognitoSub: 'local-dev|hse',
      email: 'hse@local.dev',
      departmentId: null,
    } as never);
    const req = { headers: { 'x-local-role': 'hse' } };

    await guard.canActivate(contextFor(req));

    expect(prisma.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'hse' }, create: { name: 'hse', description: 'Local dev role: hse' } }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cognitoSub: 'local-dev|hse' } }),
    );
    expect((req as { user?: { roleName: string } }).user?.roleName).toBe('hse');
  });

  it('always returns true once the user is provisioned', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.role.upsert.mockResolvedValue({ id: 'role-1', name: 'admin' } as never);
    prisma.user.upsert.mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'local-dev|admin',
      email: 'admin@local.dev',
      departmentId: null,
    } as never);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });
});
