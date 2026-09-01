import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createMockPrisma, MockPrisma } from '../../test/utils/mock-prisma';
import { CognitoAuthGuard } from './cognito-auth.guard';

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: jest.fn() },
}));

function fakeConfig(): ConfigService {
  return { getOrThrow: jest.fn().mockReturnValue('fake-config-value') } as unknown as ConfigService;
}

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('CognitoAuthGuard', () => {
  let prisma: MockPrisma;
  let reflector: jest.Mocked<Reflector>;
  let verify: jest.Mock;
  let guard: CognitoAuthGuard;

  beforeEach(() => {
    prisma = createMockPrisma();
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    verify = jest.fn();
    (CognitoJwtVerifier.create as jest.Mock).mockReturnValue({ verify });

    guard = new CognitoAuthGuard(fakeConfig(), prisma, reflector);
  });

  it('allows @Public() routes without checking for a token at all', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const req = {}; // no headers — would blow up if the guard tried to read them

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization header', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Basic xyz' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token the verifier rejects', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockRejectedValue(new Error('signature mismatch'));

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer bad-token' } })),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('populates req.user from an existing local user record matched by cognitoSub', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      departmentId: 'dept-1',
      isActive: true,
      role: { name: 'admin' },
    } as never);
    const req = { headers: { authorization: 'Bearer good-token' } };

    const result = await guard.canActivate(contextFor(req));

    expect(result).toBe(true);
    expect(req).toHaveProperty('user', {
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      roleName: 'admin',
      departmentId: 'dept-1',
    });
  });

  it('lazily creates a local user record the first time a cognitoSub is seen', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-new', email: 'new@b.com' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-2',
      cognitoSub: 'sub-new',
      email: 'new@b.com',
      departmentId: null,
      isActive: true,
      role: null,
    } as never);
    const req = { headers: { authorization: 'Bearer good-token' } };

    await guard.canActivate(contextFor(req));

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cognitoSub: 'sub-new', email: 'new@b.com', firstName: '', lastName: '' }),
      }),
    );
    expect((req as { user?: { roleName: string | null } }).user?.roleName).toBeNull();
  });

  it('falls back to an empty email when the token payload has none', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-new' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-2', isActive: true, role: null } as never);

    await guard.canActivate(contextFor({ headers: { authorization: 'Bearer good-token' } }));

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: '' }) }),
    );
  });

  it('rejects a deactivated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: false, role: null } as never);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer good-token' } })),
    ).rejects.toThrow('User account is deactivated');
  });

  it('falls back to the erp_session cookie when there is no Authorization header', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      departmentId: null,
      isActive: true,
      role: null,
    } as never);
    const req = { headers: {}, cookies: { erp_session: 'cookie-token' } };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('cookie-token');
  });

  it('rejects when neither a bearer header nor a session cookie is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(guard.canActivate(contextFor({ headers: {}, cookies: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('assigns a role the first time the token carries a matching Cognito group', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['hse'] });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      departmentId: null,
      isActive: true,
      roleId: null,
      role: null,
    } as never);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-hse', name: 'hse' } as never);

    const req = { headers: { authorization: 'Bearer good-token' } };
    await guard.canActivate(contextFor(req));

    expect(prisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'hse' } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { roleId: 'role-hse' } });
    expect((req as { user?: { roleName: string | null } }).user?.roleName).toBe('hse');
  });

  it('prefers the admin group when the token lists multiple Cognito groups', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['hse', 'admin'] });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      roleId: null,
      role: null,
    } as never);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-admin', name: 'admin' } as never);

    await guard.canActivate(contextFor({ headers: { authorization: 'Bearer good-token' } }));

    expect(prisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'admin' } });
  });

  it('does not touch the database when the group already matches the current role', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['hse'] });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      roleId: 'role-hse',
      role: { name: 'hse' },
    } as never);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-hse', name: 'hse' } as never);

    await guard.canActivate(contextFor({ headers: { authorization: 'Bearer good-token' } }));

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('leaves the role alone when no Cognito group matches a known Role', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['not-a-real-role'] });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      roleId: null,
      role: null,
    } as never);
    prisma.role.findUnique.mockResolvedValue(null);

    const req = { headers: { authorization: 'Bearer good-token' } };
    await guard.canActivate(contextFor(req));

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect((req as { user?: { roleName: string | null } }).user?.roleName).toBeNull();
  });

  it('does not touch role sync at all when the token carries no Cognito groups', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    verify.mockResolvedValue({ sub: 'sub-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      roleId: 'role-admin',
      role: { name: 'admin' },
    } as never);

    await guard.canActivate(contextFor({ headers: { authorization: 'Bearer good-token' } }));

    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });
});
