import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { getAccessSettings, signupBlockedReason } from '../modules/settings/access-settings';
import { ALLOW_INACTIVE_KEY } from './allow-inactive.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { assertAccountUsable } from './user-status';

/**
 * Stands in for CognitoAuthGuard when AUTH_MODE=local (see auth.module.ts).
 * Instead of verifying a real JWT, it trusts an `x-local-role` header
 * (defaulting to "admin") and upserts a matching fake user in the local
 * database. This exists ONLY so the app can be run and clicked around on a
 * personal PC without an AWS account — never enable AUTH_MODE=local
 * anywhere reachable from the internet.
 *
 * An `x-local-signup: <email>` header previews the self-sign-up flow instead:
 * it behaves like a real login by that email, so the user starts PENDING and
 * only gets in once an admin approves them.
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
    const signupEmail = (req.headers['x-local-signup'] as string | undefined)?.trim().toLowerCase();
    if (signupEmail) {
      return this.signupPreview(context, req, signupEmail);
    }

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
      // The role-switcher users exist to try out each role, so they are
      // always active whatever an admin does to them on the Users screen.
      status: 'ACTIVE',
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      rejectionReason: null,
    };

    return true;
  }

  private async signupPreview(context: ExecutionContext, req: Request, email: string): Promise<boolean> {
    const cognitoSub = `local-signup|${email}`;
    let user = await this.prisma.user.findUnique({ where: { cognitoSub }, include: { role: true } });

    if (!user) {
      const blocked = signupBlockedReason(await getAccessSettings(this.prisma), email);
      const status: UserStatus = blocked ? 'REJECTED' : 'PENDING';
      user = await this.prisma.user.create({
        data: { cognitoSub, email, firstName: '', lastName: '', status, isActive: false, rejectionReason: blocked },
        include: { role: true },
      });
    }

    const allowInactive = !!this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    assertAccountUsable(user.status, allowInactive);

    req.user = {
      id: user.id,
      cognitoSub: user.cognitoSub,
      email: user.email,
      roleName: user.role?.name ?? null,
      departmentId: user.departmentId,
      status: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      rejectionReason: user.rejectionReason,
    };

    return true;
  }
}
