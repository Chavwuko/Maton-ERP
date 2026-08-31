import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { Roles } from '../../auth/roles.guard';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { ProjectsService } from './projects.service';

// Any authenticated user can read; creating a project or moving its status
// is restricted to project_control/admin, unlike Document Control where any
// department can create — project setup is centrally managed here.
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Query('organizationId') organizationId?: string, @Query('status') status?: ProjectStatus) {
    return this.projectsService.findAll({ organizationId, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Roles('admin', 'project_control')
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Roles('admin', 'project_control')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateProjectStatusDto) {
    return this.projectsService.updateStatus(id, dto);
  }

  @Get(':id/milestones')
  listMilestones(@Param('id') id: string) {
    return this.projectsService.listMilestones(id);
  }

  @Roles('admin', 'project_control')
  @Post(':id/milestones')
  createMilestone(@Param('id') id: string, @Body() dto: CreateMilestoneDto) {
    return this.projectsService.createMilestone(id, dto);
  }

  @Roles('admin', 'project_control')
  @Patch(':id/milestones/:milestoneId')
  updateMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.projectsService.updateMilestone(id, milestoneId, dto);
  }
}
