// decision is APPROVED, DECLINED or COMPLETED. Completing may also issue stock:
// `issue` lists what actually leaves the store, taken from `warehouseId` and
// charged to the requester's department (or `projectId` when they have none).
export class ReviewAppointmentDto {
  decision!: string;
  feedback?: string;
  warehouseId?: string;
  projectId?: string;
  issue?: { itemId: string; quantity: number }[];
}
