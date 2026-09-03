import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmploymentStatus } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { DocumentControlService } from '../document-control/document-control.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmploymentStatusDto } from './dto/update-employment-status.dto';
import { UploadEmployeeDocumentDto } from './dto/upload-employee-document.dto';
import { EmployeesService } from './employees.service';

// Reads are open to any authenticated user (an org directory); creating an
// employee record or changing employment status is restricted to
// admin/hr. The /me and /dashboard routes are declared before the /:id
// routes below so Express matches them as literal segments rather than
// the :id param.
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly documentControlService: DocumentControlService,
  ) {}

  @Get('me')
  findMe(@Req() req: Request) {
    return this.employeesService.findByUserId(req.user!.id);
  }

  @Get('me/documents')
  async findMyDocuments(@Req() req: Request) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.documentControlService.findAll({ employeeId: employee.id });
  }

  @Post('me/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyDocument(
    @Body() dto: UploadEmployeeDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const employee = await this.employeesService.findByUserId(req.user!.id);
    return this.documentControlService.create(
      {
        organizationId: employee.organizationId,
        employeeId: employee.id,
        title: dto.title,
        category: dto.category,
        description: dto.description,
      },
      req.user!.id,
      file,
    );
  }

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('employmentStatus') employmentStatus?: EmploymentStatus,
    @Query('managerId') managerId?: string,
  ) {
    return this.employeesService.findAll({ organizationId, employmentStatus, managerId });
  }

  @Get('dashboard')
  getDashboard(@Query('organizationId') organizationId?: string) {
    return this.employeesService.getDashboard({ organizationId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Roles('admin', 'hr')
  @Get(':id/documents')
  findDocuments(@Param('id') id: string) {
    return this.documentControlService.findAll({ employeeId: id });
  }

  @Roles('admin', 'hr')
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Roles('admin', 'hr')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateEmploymentStatusDto) {
    return this.employeesService.updateEmploymentStatus(id, dto);
  }

  @Roles('admin', 'hr')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }
}
