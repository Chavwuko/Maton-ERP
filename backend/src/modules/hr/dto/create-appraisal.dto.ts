import { AppraisalRelationType } from '@prisma/client';

export class CreateAppraisalDto {
  employeeId!: string;
  reviewers!: { employeeId: string; relationType: AppraisalRelationType }[];
}
