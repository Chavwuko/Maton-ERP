// Every field is optional. Send null (or an empty string) to clear
// `description` or `assignedToId`. `active: false` pauses the schedule: it
// opens no work orders until resumed.
export class UpdateMaintenanceScheduleDto {
  title?: string;
  description?: string | null;
  intervalValue?: number;
  intervalUnit?: string;
  basis?: string;
  priority?: string;
  assignedToId?: string | null;
  leadDays?: number;
  nextDueDate?: string;
  active?: boolean;
}
