import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles, ROLES_KEY, RolesGuard } from './roles.guard';

function contextWithUser(roleName: string | undefined | null): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => (roleName === undefined ? {} : { user: { roleName } }),
    }),
  } as unknown as ExecutionContext;
}

describe('Roles decorator', () => {
  it('attaches the given role names as metadata', () => {
    class TestController {
      @Roles('admin', 'hse')
      handler() {}
    }

    expect(Reflect.getMetadata(ROLES_KEY, TestController.prototype.handler)).toEqual(['admin', 'hse']);
  });
});

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('allows the request through when no @Roles(...) is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('allows the request through when @Roles() was given an empty list', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(contextWithUser('finance'))).toBe(true);
  });

  it('admin always passes, regardless of which roles were required', () => {
    reflector.getAllAndOverride.mockReturnValue(['hse', 'maintenance']);

    expect(guard.canActivate(contextWithUser('admin'))).toBe(true);
  });

  it("allows a user whose role is in the required list", () => {
    reflector.getAllAndOverride.mockReturnValue(['hse', 'maintenance']);

    expect(guard.canActivate(contextWithUser('hse'))).toBe(true);
  });

  it("rejects a user whose role is not in the required list", () => {
    reflector.getAllAndOverride.mockReturnValue(['hse', 'maintenance']);

    expect(guard.canActivate(contextWithUser('finance'))).toBe(false);
  });

  it('rejects when there is no authenticated user at all', () => {
    reflector.getAllAndOverride.mockReturnValue(['hse']);

    expect(guard.canActivate(contextWithUser(undefined))).toBe(false);
  });

  it('rejects when the user has no role assigned', () => {
    reflector.getAllAndOverride.mockReturnValue(['hse']);

    expect(guard.canActivate(contextWithUser(null))).toBe(false);
  });
});
