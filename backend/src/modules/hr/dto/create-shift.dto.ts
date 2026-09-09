export class CreateShiftDto {
  organizationId!: string;
  name!: string;
  // 24h "HH:mm", e.g. "09:00"
  startTime!: string;
  endTime!: string;
  breakMinutes?: number;
}
