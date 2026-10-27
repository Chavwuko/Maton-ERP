// organizationId comes from the asset. firstDueDate is when the first service
// falls due (YYYY-MM-DD); after that the interval takes over.
export class CreateMaintenanceScheduleDto {
  assetId!: string;
  title!: string;
  description?: string;
  intervalValue!: number;
  intervalUnit!: string; // DAYS | WEEKS | MONTHS | YEARS
  basis?: string; // FIXED (default) | FLOATING
  priority?: string; // LOW | MEDIUM (default) | HIGH | CRITICAL
  assignedToId?: string;
  leadDays?: number; // open the work order this many days ahead, default 7
  firstDueDate!: string;
}
