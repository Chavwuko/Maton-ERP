import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { assertAccountUsable } from './user-status';

describe('assertAccountUsable', () => {
  it('lets an active user through', () => {
    expect(() => assertAccountUsable('ACTIVE', false)).not.toThrow();
  });

  it('turns a disabled user away with 401', () => {
    expect(() => assertAccountUsable('DISABLED', false)).toThrow(UnauthorizedException);
  });

  it('tells a pending user their account is awaiting approval', () => {
    expect(() => assertAccountUsable('PENDING', false)).toThrow(ForbiddenException);
    expect(() => assertAccountUsable('PENDING', false)).toThrow('Your account is awaiting administrator approval');
  });

  it('tells a rejected user their request was not approved', () => {
    expect(() => assertAccountUsable('REJECTED', false)).toThrow('Your access request was not approved');
  });

  it('lets any status through an @AllowInactive() route', () => {
    for (const status of ['PENDING', 'REJECTED', 'DISABLED'] as const) {
      expect(() => assertAccountUsable(status, true)).not.toThrow();
    }
  });
});
