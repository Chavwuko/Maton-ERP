// How each change request shows up in the activity log. The key is
// "<METHOD> <route pattern>" exactly as Express reports it; anything not listed
// is still logged, just under that key (see ActivityLogInterceptor).
export interface ActivityContext {
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  res: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ActivityLabel {
  action: string | ((ctx: ActivityContext) => string);
  entityType: string;
  summary?: (ctx: ActivityContext) => string | undefined;
}

const sign = (n: number) => `${n > 0 ? '+' : ''}${n}`;

export const ACTIVITY_LABELS: Record<string, ActivityLabel> = {
  'POST /inventory-items': { action: 'ITEM_CREATE', entityType: 'InventoryItem', summary: ({ res }) => `${res.sku} ${res.name}` },
  'PATCH /inventory-items/:id': { action: 'ITEM_UPDATE', entityType: 'InventoryItem', summary: ({ res }) => `${res.sku} ${res.name}` },
  'DELETE /inventory-items/:id': { action: 'ITEM_DELETE', entityType: 'InventoryItem', summary: ({ res }) => `${res.sku} ${res.name}` },
  'POST /item-categories': { action: 'CATEGORY_CREATE', entityType: 'ItemCategory', summary: ({ res }) => res.name },
  'POST /warehouses': { action: 'WAREHOUSE_CREATE', entityType: 'Warehouse', summary: ({ res }) => `${res.code} ${res.name}` },
  'POST /purchases': {
    action: 'PURCHASE',
    entityType: 'Purchase',
    summary: ({ res }) => `PO ${res.poNumber ?? '-'}, quantity ${res.quantity}, total ${res.total}`,
  },
  'DELETE /purchases/:id': { action: 'PURCHASE_DELETE', entityType: 'Purchase' },
  'POST /consumptions': { action: 'ISSUE', entityType: 'Consumption', summary: ({ res }) => `quantity ${res.quantity}, cost ${res.total}` },
  'DELETE /consumptions/:id': { action: 'ISSUE_DELETE', entityType: 'Consumption' },
  'POST /stock-transactions': {
    action: 'STOCK_MOVEMENT',
    entityType: 'StockTransaction',
    summary: ({ res }) => `${res.type} ${res.quantity}`,
  },
  'POST /stock-transactions/adjust': {
    action: 'STOCK_ADJUST',
    entityType: 'StockTransaction',
    summary: ({ res, body }) => `${sign(res.quantity)} (${body.reason})`,
  },
  'POST /stock-transactions/transfer': { action: 'STOCK_TRANSFER', entityType: 'StockTransaction', summary: ({ body }) => `quantity ${body.quantity}` },

  'POST /assets': { action: 'ASSET_CREATE', entityType: 'Asset', summary: ({ res }) => `${res.assetTag} ${res.name}` },
  'PATCH /assets/:id': { action: 'ASSET_UPDATE', entityType: 'Asset', summary: ({ res }) => `${res.assetTag} ${res.name}` },
  'POST /assets/:id/check-out': {
    action: 'ASSET_CHECKED_OUT',
    entityType: 'Asset',
    summary: ({ res }) => {
      const to = res.currentAssignment?.assignee
        ? `${res.currentAssignment.assignee.firstName} ${res.currentAssignment.assignee.lastName}`.trim() || res.currentAssignment.assignee.email
        : res.currentAssignment?.department?.name;
      return `${res.assetTag} to ${to ?? 'someone'}`;
    },
  },
  'POST /assets/:id/check-in': { action: 'ASSET_CHECKED_IN', entityType: 'Asset', summary: ({ res }) => `${res.assetTag} returned, condition ${res.condition}` },

  'POST /maintenance-schedules': { action: 'MAINTENANCE_SCHEDULE_CREATE', entityType: 'MaintenanceSchedule', summary: ({ res }) => `${res.title} (${res.asset?.assetTag})` },
  'PATCH /maintenance-schedules/:id': { action: 'MAINTENANCE_SCHEDULE_UPDATE', entityType: 'MaintenanceSchedule', summary: ({ res }) => `${res.title} (${res.asset?.assetTag})` },
  'DELETE /maintenance-schedules/:id': { action: 'MAINTENANCE_SCHEDULE_DELETE', entityType: 'MaintenanceSchedule', summary: ({ res }) => res.title },
  'POST /maintenance-schedules/generate': { action: 'MAINTENANCE_GENERATE', entityType: 'MaintenanceSchedule', summary: ({ res }) => `${res.created} work order(s) opened` },

  'POST /appointments': { action: 'APPOINTMENT_BOOKED', entityType: 'Appointment', summary: ({ res }) => `${res.subject} on ${String(res.date).slice(0, 10)} at ${res.time}` },
  'POST /appointments/:id/cancel': { action: 'APPOINTMENT_CANCELLED', entityType: 'Appointment', summary: ({ res }) => res.subject },
  'POST /appointments/:id/review': {
    action: ({ res }) => `APPOINTMENT_${res.status}`,
    entityType: 'Appointment',
    summary: ({ res }) => [res.subject, res.issuedNote].filter(Boolean).join(' · '),
  },
  'PUT /appointments/schedule': { action: 'SCHEDULE_UPDATE', entityType: 'Settings', summary: ({ res }) => `${res.workStart}-${res.workEnd}, ${res.slotMinutes} min, ${res.slotCapacity} at a time` },

  'POST /auth/request-access': { action: 'ACCESS_REQUEST', entityType: 'User', summary: ({ res }) => res.email },
  'POST /users/:id/approve': { action: 'ACCESS_APPROVED', entityType: 'User', summary: ({ res }) => `${res.email} as ${res.role?.name}` },
  'POST /users/:id/reject': { action: 'ACCESS_REJECTED', entityType: 'User', summary: ({ res }) => res.email },
  'POST /users/:id/disable': { action: 'USER_DISABLED', entityType: 'User', summary: ({ res }) => res.email },
  'POST /users/:id/enable': { action: 'USER_ENABLED', entityType: 'User', summary: ({ res }) => res.email },
  'PATCH /users/:id': { action: 'USER_UPDATE', entityType: 'User', summary: ({ res }) => `${res.email} as ${res.role?.name ?? 'no role'}` },
  'PUT /settings/access': {
    action: 'SETTINGS_UPDATE',
    entityType: 'Settings',
    summary: ({ res }) => `sign-up ${res.openSignup ? 'open' : 'closed'}, domains ${res.allowedEmailDomains.join(', ') || 'any'}`,
  },
};
