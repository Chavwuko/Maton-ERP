import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.organization.findMany({
      include: { departments: true },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { departments: true, projects: true },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({ data: dto });
  }
}
