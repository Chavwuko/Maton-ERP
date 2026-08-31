import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../auth/roles.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';

// Every authenticated user can read; only admins can create. This is the
// pattern to copy for new feature modules (Maintenance, HSE, etc.) — apply
// CognitoAuthGuard/RolesGuard globally (already done in AuthModule) and
// just add @Roles(...) where a route needs to be restricted further.
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }
}
