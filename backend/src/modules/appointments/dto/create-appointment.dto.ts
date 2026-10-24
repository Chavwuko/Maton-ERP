// The requester is the signed-in user; their department is taken from their
// own record, never from the client.
export class CreateAppointmentDto {
  date!: string; // YYYY-MM-DD
  time!: string; // HH:MM, must be the start of a slot
  type?: string;
  subject!: string;
  details?: string;
  items?: { itemId: string; quantity: number }[];
}
