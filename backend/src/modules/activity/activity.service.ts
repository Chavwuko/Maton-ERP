import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface ActivityEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Writing the log must never get in the way of the work it describes.
  async record(entry: ActivityEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (error) {
      this.logger.warn(`Could not record ${entry.action}: ${(error as Error).message}`);
    }
  }

  list(filters: { userId?: string; action?: string; entityType?: string; from?: string; to?: string; limit?: string }) {
    const limit = filters.limit === undefined ? DEFAULT_LIMIT : Number(filters.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(`limit must be a whole number from 1 to ${MAX_LIMIT}`);
    }
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('from and to must be dates like 2026-10-24');
    }
    // "to" is a calendar day: include all of it.
    if (to) to.setUTCHours(23, 59, 59, 999);

    return this.prisma.auditLog.findMany({
      where: {
        userId: filters.userId,
        action: filters.action,
        entityType: filters.entityType,
        createdAt: from || to ? { gte: from, lte: to } : undefined,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
