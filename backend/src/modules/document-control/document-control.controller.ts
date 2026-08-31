import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentStatus } from '@prisma/client';
import { Request } from 'express';
import { DocumentControlService } from './document-control.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { SubmitForReviewDto } from './dto/submit-for-review.dto';

// Any authenticated user can read and create documents (every department
// uploads its own docs); the review/approval endpoints are gated at the
// service layer against the reviewers assigned via `submit`, not by role,
// since "who can approve this" is per-document rather than per-role.
@Controller('documents')
export class DocumentControlController {
  constructor(private readonly documentControlService: DocumentControlService) {}

  @Get()
  findAll(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: DocumentStatus,
    @Query('departmentId') departmentId?: string,
    @Query('projectId') projectId?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('incidentId') incidentId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.documentControlService.findAll({
      organizationId,
      status,
      departmentId,
      projectId,
      workOrderId,
      invoiceId,
      incidentId,
      employeeId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentControlService.findOne(id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.documentControlService.create(dto, req.user!.id, file);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file'))
  addVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.documentControlService.addVersion(id, req.user!.id, file);
  }

  @Get(':id/versions/:versionId/download')
  getDownloadUrl(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.documentControlService.getDownloadUrl(id, versionId);
  }

  @Post(':id/submit')
  submitForReview(@Param('id') id: string, @Body() dto: SubmitForReviewDto) {
    return this.documentControlService.submitForReview(id, dto);
  }

  @Post(':id/review')
  recordDecision(@Param('id') id: string, @Body() dto: ReviewDecisionDto, @Req() req: Request) {
    return this.documentControlService.recordDecision(id, req.user!.id, dto);
  }
}
