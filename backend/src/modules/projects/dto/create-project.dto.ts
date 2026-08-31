export class CreateProjectDto {
  organizationId!: string;
  code!: string;
  name!: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
}
