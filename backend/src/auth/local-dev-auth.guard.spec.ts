import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMockPrisma, MockPrisma } from '../../test/utils/mock-prisma';
import { ALLOW_INACTIVE_KEY } from './allow-inactive.decorator';
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
      firstName: 'Local',
      lastName: 'Dev',
      phone: null,
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
      status: 'ACTIVE',
      firstName: 'Local',
      lastName: 'Dev',
      phone: null,
      rejectionReason: null,
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

  describe('x-local-signup preview', () => {
    const signupRequest = (email = 'New.Person@Acme.com') => ({ headers: { 'x-local-signup': email } });

    it('creates a PENDING user for an unknown email (lower-cased) and keeps them out of ordinary routes', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.appSetting.findMany.mockResolvedValue([]);
      prisma.user.create.mockResolvedValue({ id: 'u1', status: 'PENDING', role: null } as never);

      await expect(guard.canActivate(contextFor(signupRequest()))).rejects.toThrow(
        'Your account is awaiting administrator approval',
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cognitoSub: 'local-signup|new.person@acme.com',
            email: 'new.person@acme.com',
            status: 'PENDING',
            isActive: false,
          }),
        }),
      );
      expect(prisma.role.upsert).not.toHaveBeenCalled();
    });

    it('lets the pending user reach an @AllowInactive() route and reports their status', async () => {
      reflector.getAllAndOverride.mockImplementation((key) => key === ALLOW_INACTIVE_KEY);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cognitoSub: 'local-signup|new.person@acme.com',
        email: 'new.person@acme.com',
        departmentId: null,
        status: 'PENDING',
        firstName: '',
        lastName: '',
        phone: null,
        rejectionReason: null,
        role: null,
      } as never);
      const req = signupRequest();

      await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(req).toHaveProperty('user.status', 'PENDING');
      expect(req).toHaveProperty('user.roleName', null);
    });

    it('creates the user as REJECTED, with the reason, when sign-ups are closed', async () => {
      reflector.getAllAndOverride.mockImplementation((key) => key === ALLOW_INACTIVE_KEY);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.appSetting.findMany.mockResolvedValue([{ key: 'signup.open', value: 'false' }] as never);
      prisma.user.create.mockResolvedValue({ id: 'u1', status: 'REJECTED', role: null } as never);

      await guard.canActivate(contextFor(signupRequest()));

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectionReason: 'Sign-ups are currently closed. Contact an administrator.',
          }),
        }),
      );
    });

    it('gives an approved user their assigned role', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cognitoSub: 'local-signup|a@acme.com',
        email: 'a@acme.com',
        departmentId: 'dept-1',
        status: 'ACTIVE',
        firstName: 'Ann',
        lastName: 'Store',
        phone: '555',
        rejectionReason: null,
        role: { name: 'inventory' },
      } as never);
      const req = signupRequest('a@acme.com');

      await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);

      expect(req).toHaveProperty('user.roleName', 'inventory');
    });
  });
});
