export class UpdateDepartmentDto {
  name?: string;
  code?: string;
  // The user who heads the department; null clears it.
  headId?: string | null;
}
