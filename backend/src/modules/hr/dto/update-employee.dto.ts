import { EmployeeGrade, EmploymentType, Gender } from '@prisma/client';

// Profile fields only — employmentStatus/exitDate go through
// UpdateEmploymentStatusDto instead, since that transition has its own
// business rules (see EmployeesService.updateEmploymentStatus).
export class UpdateEmployeeDto {
  jobTitle?: string;
  managerId?: string;
  dateOfBirth?: string;
  gender?: Gender;
  employmentType?: EmploymentType;
  grade?: EmployeeGrade;
  branch?: string;
}
