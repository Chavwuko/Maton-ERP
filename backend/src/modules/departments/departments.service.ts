import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { organizationId?: string }) {
    return this.prisma.department.findMany({
      where: { organizationId: filters.organizationId },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) {
      throw new NotFoundException(`Department ${id} not found`);
    }
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    try {
      return await this.prisma.department.create({ data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Department code "${dto.code}" already exists in this organization`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    try {
      return await this.prisma.department.update({ where: { id }, data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException(`Department code "${dto.code}" already exists in this organization`);
        }
        if (err.code === 'P2025') {
          throw new NotFoundException(`Department ${id} not found`);
        }
      }
      throw err;
    }
  }
}
