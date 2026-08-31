import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    // A lightweight query confirms the DB connection is alive, not just
    // that the Node process is running.
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
