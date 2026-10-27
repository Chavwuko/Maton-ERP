import { ACTIVITY_LABELS } from './activity-labels';

type Case = [key: string, ctx: { body?: object; res?: object }, action: string, summary: string | undefined];

// One row per label: what the log says for a typical request and response.
const CASES: Case[] = [
  ['POST /inventory-items', { res: { sku: 'GLV-1', name: 'Gloves' } }, 'ITEM_CREATE', 'GLV-1 Gloves'],
  ['PATCH /inventory-items/:id', { res: { sku: 'GLV-1', name: 'Gloves' } }, 'ITEM_UPDATE', 'GLV-1 Gloves'],
  ['DELETE /inventory-items/:id', { res: { sku: 'GLV-1', name: 'Gloves' } }, 'ITEM_DELETE', 'GLV-1 Gloves'],
  ['POST /item-categories', { res: { name: 'Electrical' } }, 'CATEGORY_CREATE', 'Electrical'],
  ['POST /warehouses', { res: { code: 'MAIN', name: 'Main store' } }, 'WAREHOUSE_CREATE', 'MAIN Main store'],
  ['POST /purchases', { res: { poNumber: 'PO-1', quantity: 5, total: '25.00' } }, 'PURCHASE', 'PO PO-1, quantity 5, total 25.00'],
  ['POST /purchases', { res: { poNumber: null, quantity: 5, total: '25.00' } }, 'PURCHASE', 'PO -, quantity 5, total 25.00'],
  ['DELETE /purchases/:id', { res: {} }, 'PURCHASE_DELETE', undefined],
  ['POST /consumptions', { res: { quantity: 2, total: '9.60' } }, 'ISSUE', 'quantity 2, cost 9.60'],
  ['DELETE /consumptions/:id', { res: {} }, 'ISSUE_DELETE', undefined],
  ['POST /stock-transactions', { res: { type: 'RECEIPT', quantity: 7 } }, 'STOCK_MOVEMENT', 'RECEIPT 7'],
  ['POST /stock-transactions/adjust', { res: { quantity: -9.75 }, body: { reason: 'Annual count' } }, 'STOCK_ADJUST', '-9.75 (Annual count)'],
  ['POST /stock-transactions/adjust', { res: { quantity: 3 }, body: { reason: 'Found' } }, 'STOCK_ADJUST', '+3 (Found)'],
  ['POST /stock-transactions/transfer', { res: {}, body: { quantity: 4 } }, 'STOCK_TRANSFER', 'quantity 4'],
  ['POST /assets', { res: { assetTag: 'PUMP-1', name: 'Pump' } }, 'ASSET_CREATE', 'PUMP-1 Pump'],
  ['PATCH /assets/:id', { res: { assetTag: 'PUMP-1', name: 'Pump' } }, 'ASSET_UPDATE', 'PUMP-1 Pump'],
  ['POST /assets/:id/check-out', { res: { assetTag: 'PUMP-1', currentAssignment: { assignee: { firstName: 'Ann', lastName: 'Store', email: 'a@b.test' } } } }, 'ASSET_CHECKED_OUT', 'PUMP-1 to Ann Store'],
  ['POST /assets/:id/check-out', { res: { assetTag: 'PUMP-1', currentAssignment: { assignee: { firstName: '', lastName: '', email: 'a@b.test' } } } }, 'ASSET_CHECKED_OUT', 'PUMP-1 to a@b.test'],
  ['POST /assets/:id/check-out', { res: { assetTag: 'PUMP-1', currentAssignment: { assignee: null, department: { name: 'Workshop' } } } }, 'ASSET_CHECKED_OUT', 'PUMP-1 to Workshop'],
  ['POST /assets/:id/check-out', { res: { assetTag: 'PUMP-1', currentAssignment: null } }, 'ASSET_CHECKED_OUT', 'PUMP-1 to someone'],
  ['POST /assets/:id/check-in', { res: { assetTag: 'PUMP-1', condition: 'FAIR' } }, 'ASSET_CHECKED_IN', 'PUMP-1 returned, condition FAIR'],
  ['POST /maintenance-schedules', { res: { title: 'Grease bearings', asset: { assetTag: 'PUMP-1' } } }, 'MAINTENANCE_SCHEDULE_CREATE', 'Grease bearings (PUMP-1)'],
  ['PATCH /maintenance-schedules/:id', { res: { title: 'Grease bearings', asset: { assetTag: 'PUMP-1' } } }, 'MAINTENANCE_SCHEDULE_UPDATE', 'Grease bearings (PUMP-1)'],
  ['DELETE /maintenance-schedules/:id', { res: { title: 'Grease bearings' } }, 'MAINTENANCE_SCHEDULE_DELETE', 'Grease bearings'],
  ['POST /maintenance-schedules/generate', { res: { created: 3 } }, 'MAINTENANCE_GENERATE', '3 work order(s) opened'],
  ['POST /appointments', { res: { subject: 'Gloves', date: '2026-10-26T00:00:00.000Z', time: '09:00' } }, 'APPOINTMENT_BOOKED', 'Gloves on 2026-10-26 at 09:00'],
  ['POST /appointments/:id/cancel', { res: { subject: 'Gloves' } }, 'APPOINTMENT_CANCELLED', 'Gloves'],
  ['POST /appointments/:id/review', { res: { status: 'COMPLETED', subject: 'Gloves', issuedNote: 'Issued: 3 pcs Gloves' } }, 'APPOINTMENT_COMPLETED', 'Gloves · Issued: 3 pcs Gloves'],
  ['POST /appointments/:id/review', { res: { status: 'APPROVED', subject: 'Gloves', issuedNote: null } }, 'APPOINTMENT_APPROVED', 'Gloves'],
  ['PUT /appointments/schedule', { res: { workStart: '08:00', workEnd: '17:00', slotMinutes: 30, slotCapacity: 2 } }, 'SCHEDULE_UPDATE', '08:00-17:00, 30 min, 2 at a time'],
  ['POST /auth/request-access', { res: { email: 'a@b.test' } }, 'ACCESS_REQUEST', 'a@b.test'],
  ['POST /users/:id/approve', { res: { email: 'a@b.test', role: { name: 'staff' } } }, 'ACCESS_APPROVED', 'a@b.test as staff'],
  ['POST /users/:id/reject', { res: { email: 'a@b.test' } }, 'ACCESS_REJECTED', 'a@b.test'],
  ['POST /users/:id/disable', { res: { email: 'a@b.test' } }, 'USER_DISABLED', 'a@b.test'],
  ['POST /users/:id/enable', { res: { email: 'a@b.test' } }, 'USER_ENABLED', 'a@b.test'],
  ['PATCH /users/:id', { res: { email: 'a@b.test', role: { name: 'hse' } } }, 'USER_UPDATE', 'a@b.test as hse'],
  ['PATCH /users/:id', { res: { email: 'a@b.test', role: null } }, 'USER_UPDATE', 'a@b.test as no role'],
  ['PUT /settings/access', { res: { openSignup: false, allowedEmailDomains: ['acme.com', 'x.org'] } }, 'SETTINGS_UPDATE', 'sign-up closed, domains acme.com, x.org'],
  ['PUT /settings/access', { res: { openSignup: true, allowedEmailDomains: [] } }, 'SETTINGS_UPDATE', 'sign-up open, domains any'],
];

describe('ACTIVITY_LABELS', () => {
  it.each(CASES)('%s -> %s', (key, ctx, action, summary) => {
    const label = ACTIVITY_LABELS[key];
    const full = { body: {}, res: {}, ...ctx } as never;

    expect(typeof label.action === 'function' ? label.action(full) : label.action).toBe(action);
    expect(label.summary?.(full)).toBe(summary);
    expect(label.entityType).toBeTruthy();
  });
});
