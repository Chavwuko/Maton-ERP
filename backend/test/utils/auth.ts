import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

// Wraps supertest so every call carries the x-local-role header
// LocalDevAuthGuard reads (see backend/src/auth/local-dev-auth.guard.ts) —
// the same mechanism used for manual testing throughout this project.
export function asRole(app: INestApplication, role: string) {
  const server = app.getHttpServer();
  return {
    get: (url: string) => request(server).get(url).set('x-local-role', role),
    post: (url: string) => request(server).post(url).set('x-local-role', role),
    patch: (url: string) => request(server).patch(url).set('x-local-role', role),
    delete: (url: string) => request(server).delete(url).set('x-local-role', role),
  };
}

// Triggers LocalDevAuthGuard's lazy user/role upsert for `role` (via a
// harmless authenticated GET) and returns the resulting User.id, so tests
// can reference "the admin user" etc. by id without hardcoding one.
export async function provisionUser(
  app: INestApplication,
  prisma: PrismaClient,
  role: string,
): Promise<string> {
  await asRole(app, role).get('/organizations');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: `${role}@local.dev` } });
  return user.id;
}
