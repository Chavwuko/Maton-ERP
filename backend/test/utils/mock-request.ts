import { Request } from 'express';
import { AuthenticatedUser } from '../../src/auth/cognito-auth.guard';

// Controllers only ever read `req.user` (set by CognitoAuthGuard/
// LocalDevAuthGuard upstream) — this stands in for that without needing a
// real Express request or running either guard.
export function mockRequest(user: Partial<AuthenticatedUser> = {}): Request {
  return {
    user: {
      id: 'user-1',
      cognitoSub: 'local-dev|admin',
      email: 'admin@local.dev',
      roleName: 'admin',
      departmentId: null,
      ...user,
    },
  } as Request;
}
