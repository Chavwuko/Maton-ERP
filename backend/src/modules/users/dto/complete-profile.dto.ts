// What a newly signed-up user submits to ask for access.
export class CompleteProfileDto {
  firstName!: string;
  lastName!: string;
  phone?: string;
  departmentId?: string;
}
