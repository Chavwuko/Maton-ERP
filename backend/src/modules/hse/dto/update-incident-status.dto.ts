import { IncidentStatus } from '@prisma/client';

export class UpdateIncidentStatusDto {
  status!: IncidentStatus;
}
