export class CreateLeaveRequestDto {
  leaveTypeId!: string;
  // First and last day away, as YYYY-MM-DD.
  startDate!: string;
  endDate!: string;
  reason?: string;
}

export class LeaveDecisionDto {
  decision!: string; // 'APPROVE' | 'REJECT'
  comment?: string;
}

export class CreateLeaveTypeDto {
  organizationId!: string;
  name!: string;
  // Working days a year; leave out or send null for no limit.
  daysPerYear?: number | null;
  paid?: boolean;
  allowBackdate?: boolean;
}

export class UpdateLeaveTypeDto {
  name?: string;
  daysPerYear?: number | null;
  paid?: boolean;
  allowBackdate?: boolean;
  active?: boolean;
}

export class LeaveDefaultsDto {
  organizationId!: string;
}
