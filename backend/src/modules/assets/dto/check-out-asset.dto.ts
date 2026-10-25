// Who is taking the asset: a person, a department, or both.
export class CheckOutAssetDto {
  assigneeId?: string;
  departmentId?: string;
  expectedReturn?: string; // YYYY-MM-DD
  condition?: string;
  notes?: string;
}
