import { EmploymentStatus } from '@prisma/client';

export class UpdateEmploymentStatusDto {
  employmentStatus!: EmploymentStatus;
}
