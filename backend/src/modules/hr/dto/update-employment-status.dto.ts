import { EmploymentStatus } from '@prisma/client';

export class UpdateEmploymentStatusDto {
  employmentStatus!: EmploymentStatus;
  // Last working day — only meaningful when moving to TERMINATED. Defaults
  // to today if omitted (see EmployeesService.updateEmploymentStatus).
  exitDate?: string;
}
