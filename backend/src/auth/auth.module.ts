import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { LocalDevAuthGuard } from './local-dev-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [
    // Order matters: authentication runs before role authorization.
    //
    // AUTH_MODE=local (see backend/.env.local.example) swaps in
    // LocalDevAuthGuard so the app can run on a personal PC with no AWS
    // account. Default / production behavior is unchanged: real Cognito
    // JWT verification via CognitoAuthGuard.
    {
      provide: APP_GUARD,
      useFactory: (config: ConfigService, prisma: PrismaService, reflector: Reflector) => {
        if (config.get<string>('AUTH_MODE') === 'local') {
          return new LocalDevAuthGuard(prisma, reflector);
        }
        return new CognitoAuthGuard(config, prisma, reflector);
      },
      inject: [ConfigService, PrismaService, Reflector],
    },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
