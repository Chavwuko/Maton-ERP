import { EmployeeGrade, EmploymentType, Gender } from '@prisma/client';

export class CreateEmployeeDto {
  organizationId!: string;
  userId!: string;
  employeeNumber!: string;
  jobTitle!: string;
  hireDate!: string;
  managerId?: string;
  dateOfBirth?: string;
  gender?: Gender;
  employmentType?: EmploymentType;
  grade?: EmployeeGrade;
  branch?: string;
}
