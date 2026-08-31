export class CreateEmployeeDto {
  organizationId!: string;
  userId!: string;
  employeeNumber!: string;
  jobTitle!: string;
  hireDate!: string;
  managerId?: string;
}
