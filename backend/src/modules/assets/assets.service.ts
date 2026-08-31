import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { organizationId?: string; status?: AssetStatus; projectId?: string }) {
    return this.prisma.asset.findMany({
      where: {
        organizationId: filters.organizationId,
        status: filters.status,
        projectId: filters.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { workOrders: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return asset;
  }

  async create(dto: CreateAssetDto) {
    try {
      return await this.prisma.asset.create({
        data: {
          organizationId: dto.organizationId,
          assetTag: dto.assetTag,
          name: dto.name,
          category: dto.category,
          projectId: dto.projectId,
          location: dto.location,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Asset tag "${dto.assetTag}" already exists in this organization`);
      }
      throw err;
    }
  }
}
