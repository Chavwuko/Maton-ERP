import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthenticatedUser {
  id: string;
  cognitoSub: string;
  email: string;
  roleName: string | null;
  departmentId: string | null;
}

// Extends Express's Request type so `req.user` is typed everywhere downstream.
declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: this.config.getOrThrow<string>('COGNITO_USER_POOL_ID'),
      tokenUse: 'access',
      clientId: this.config.getOrThrow<string>('COGNITO_CLIENT_ID'),
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload;
    try {
      payload = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Look up (or lazily create) the local user record. Cognito is the
    // source of truth for identity; our own `users` table holds the
    // department/role linkage the rest of the ERP needs.
    let user = await this.prisma.user.findUnique({
      where: { cognitoSub: payload.sub },
      include: { role: true },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          cognitoSub: payload.sub,
          email: (payload as Record<string, unknown>).email as string ?? '',
          firstName: '',
          lastName: '',
        },
        include: { role: true },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const role = await this.syncRoleFromCognitoGroups(user, payload);

    req.user = {
      id: user.id,
      cognitoSub: user.cognitoSub,
      email: user.email,
      roleName: role?.name ?? user.role?.name ?? null,
      departmentId: user.departmentId,
    };

    return true;
  }

  // Bearer header takes precedence (useful for tooling/scripts); the
  // backend-mediated login flow (see AuthController) otherwise leaves the
  // access token in an httpOnly cookie, since a SPA can't safely hold it.
  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return (req as Request & { cookies?: Record<string, string> }).cookies?.erp_session;
  }

  // Cognito groups are the source of truth for role assignment — group
  // membership is managed in the Cognito console/API, not this app. Every
  // request re-syncs the local Role link in case group membership changed
  // since the user's last login. A user in multiple groups gets 'admin' if
  // present (matching RolesGuard's own "admin always passes" special case),
  // otherwise whichever group comes first in the token.
  private async syncRoleFromCognitoGroups(
    user: { id: string; roleId: string | null },
    payload: unknown,
  ) {
    const groups = (payload as Record<string, unknown>)['cognito:groups'] as string[] | undefined;
    if (!groups?.length) {
      return null;
    }

    const groupName = groups.includes('admin') ? 'admin' : groups[0];
    const role = await this.prisma.role.findUnique({ where: { name: groupName } });
    if (!role || role.id === user.roleId) {
      return role;
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { roleId: role.id } });
    return role;
  }
}
