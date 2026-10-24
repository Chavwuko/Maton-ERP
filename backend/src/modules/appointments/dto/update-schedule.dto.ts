export class UpdateScheduleDto {
  workStart?: string;
  workEnd?: string;
  slotMinutes?: number;
  slotCapacity?: number;
  workingDays?: number[];
  timeZone?: string;
}
