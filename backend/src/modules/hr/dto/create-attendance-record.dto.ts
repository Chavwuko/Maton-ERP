import { AttendanceStatus } from '@prisma/client';

// Admin/hr manual entry — for days that never see a self clock-in
// (ABSENT/ON_LEAVE/HOLIDAY/HALF_DAY) or backdated corrections.
export class CreateAttendanceRecordDto {
  employeeId!: string;
  date!: string; // "YYYY-MM-DD"
  status!: AttendanceStatus;
  clockIn?: string;
  clockOut?: string;
  notes?: string;
}
