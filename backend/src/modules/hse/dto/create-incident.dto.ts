import { IncidentSeverity, IncidentType } from '@prisma/client';

export class CreateIncidentDto {
  organizationId!: string;
  title!: string;
  type!: IncidentType;
  severity!: IncidentSeverity;
  occurredAt!: string;
  description?: string;
  projectId?: string;
  assetId?: string;
  location?: string;
}
