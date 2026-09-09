import { AttendanceStatus } from '@prisma/client';

export class UpdateAttendanceRecordDto {
  status?: AttendanceStatus;
  clockIn?: string;
  clockOut?: string;
  notes?: string;
}
