import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // credentials: true (needed so the browser sends the httpOnly session
  // cookie AuthController sets — see cognito-auth.guard.ts) requires an
  // explicit origin; the wildcard default can't be combined with it.
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true });
  app.use(cookieParser());
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ERP backend listening on port ${port}`);
}

bootstrap();
