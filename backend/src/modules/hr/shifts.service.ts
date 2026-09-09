import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { organizationId?: string }) {
    return this.prisma.shift.findMany({
      where: { organizationId: filters.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) {
      throw new NotFoundException(`Shift ${id} not found`);
    }
    return shift;
  }

  async create(dto: CreateShiftDto) {
    try {
      return await this.prisma.shift.create({
        data: {
          organizationId: dto.organizationId,
          name: dto.name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          breakMinutes: dto.breakMinutes ?? 0,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Shift "${dto.name}" already exists in this organization`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateShiftDto) {
    await this.findOne(id);
    try {
      return await this.prisma.shift.update({
        where: { id },
        data: {
          name: dto.name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          breakMinutes: dto.breakMinutes,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Shift "${dto.name}" already exists in this organization`);
      }
      throw err;
    }
  }
}
