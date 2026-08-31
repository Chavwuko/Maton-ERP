import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { Roles } from '../../auth/roles.guard';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';

// Same read/write split as Organizations: any authenticated user can read,
// registering equipment is restricted to the roles that manage it.
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: AssetStatus,
    @Query('projectId') projectId?: string,
  ) {
    return this.assetsService.findAll({ organizationId, status, projectId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assetsService.findOne(id);
  }

  @Roles('admin', 'maintenance')
  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.assetsService.create(dto);
  }
}
