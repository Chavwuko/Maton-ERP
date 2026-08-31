import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to one or more role names (matching Role.name /
 * Cognito group names, e.g. "admin", "maintenance", "hse").
 *
 * Usage: @Roles('admin', 'maintenance') above a controller method.
 * Must be combined with CognitoAuthGuard, which populates req.user.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // no @Roles(...) decorator means any authenticated user
    }

    const req = context.switchToHttp().getRequest<Request>();

    // "admin" always passes, regardless of which roles were required.
    if (req.user?.roleName === 'admin') {
      return true;
    }

    return !!req.user?.roleName && requiredRoles.includes(req.user.roleName);
  }
}
