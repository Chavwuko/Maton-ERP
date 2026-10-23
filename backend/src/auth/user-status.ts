import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { UserStatus } from '@prisma/client';

// Shared by both auth guards so a Cognito login and the local-dev sign-up
// preview treat each status identically.
export function assertAccountUsable(status: UserStatus, allowInactive: boolean): void {
  if (status === 'ACTIVE' || allowInactive) {
    return;
  }
  if (status === 'DISABLED') {
    throw new UnauthorizedException('User account is deactivated');
  }
  if (status === 'REJECTED') {
    throw new ForbiddenException('Your access request was not approved');
  }
  throw new ForbiddenException('Your account is awaiting administrator approval');
}
