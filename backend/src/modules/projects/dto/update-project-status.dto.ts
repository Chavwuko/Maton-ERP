import { ProjectStatus } from '@prisma/client';

export class UpdateProjectStatusDto {
  status!: ProjectStatus;
}
