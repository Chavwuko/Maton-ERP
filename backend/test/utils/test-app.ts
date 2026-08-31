import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

// Boots the real AppModule in-process (no separate server process, no port
// binding) against whatever DATABASE_URL/S3_ENDPOINT backend/.env points
// at — the same local Postgres + MinIO used for manual dev testing.
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
