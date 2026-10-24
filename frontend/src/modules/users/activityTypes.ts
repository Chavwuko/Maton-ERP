export interface ActivityEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: { summary: string | null; method: string; path: string } | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

// The kinds of record an admin can narrow the log to. Anything else the
// system logs still shows when no type is chosen.
export const ACTIVITY_ENTITY_TYPES = [
  'InventoryItem',
  'Purchase',
  'Consumption',
  'StockTransaction',
  'Appointment',
  'User',
  'Settings',
];
