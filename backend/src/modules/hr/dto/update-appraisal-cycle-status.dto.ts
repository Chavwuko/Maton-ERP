import { AppraisalCycleStatus } from '@prisma/client';

export class UpdateAppraisalCycleStatusDto {
  status!: AppraisalCycleStatus;
}
