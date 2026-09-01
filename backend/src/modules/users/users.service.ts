import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { role?: string | string[]; isActive?: boolean }) {
    const roles = filters.role ? (Array.isArray(filters.role) ? filters.role : [filters.role]) : undefined;

    return this.prisma.user.findMany({
      where: {
        role: roles ? { name: { in: roles } } : undefined,
        isActive: filters.isActive,
      },
      include: { role: true },
      orderBy: { email: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }
}
