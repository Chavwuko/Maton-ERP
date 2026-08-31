import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Stands in for CognitoAuthGuard when AUTH_MODE=local (see auth.module.ts).
 * Instead of verifying a real JWT, it trusts an `x-local-role` header
 * (defaulting to "admin") and upserts a matching fake user in the local
 * database. This exists ONLY so the app can be run and clicked around on a
 * personal PC without an AWS account — never enable AUTH_MODE=local
 * anywhere reachable from the internet.
 */
@Injectable()
export class LocalDevAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const roleName = (req.headers['x-local-role'] as string) || 'admin';
    const fakeSub = `local-dev|${roleName}`;

    const role = await this.prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `Local dev role: ${roleName}` },
    });

    const user = await this.prisma.user.upsert({
      where: { cognitoSub: fakeSub },
      update: {},
      create: {
        cognitoSub: fakeSub,
        email: `${roleName}@local.dev`,
        firstName: 'Local',
        lastName: 'Dev',
        roleId: role.id,
      },
    });

    req.user = {
      id: user.id,
      cognitoSub: user.cognitoSub,
      email: user.email,
      roleName: role.name,
      departmentId: user.departmentId,
    };

    return true;
  }
}
