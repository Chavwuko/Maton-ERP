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
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);

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

    req.user = {
      id: user.id,
      cognitoSub: user.cognitoSub,
      email: user.email,
      roleName: user.role?.name ?? null,
      departmentId: user.departmentId,
    };

    return true;
  }
}
