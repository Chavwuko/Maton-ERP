import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import type { InventoryService } from '../inventory/inventory.service';
import { DashboardService } from './dashboard.service';

// Thursday 2026-10-22, 10:00 in Lagos.
const NOW = new Date('2026-10-22T09:00:00.000Z');

const user = (roleName: string | null, overrides: Partial<AuthenticatedUser> = {}) =>
  ({ id: 'u1', roleName, email: 'a@acme.test', firstName: 'Ann', lastName: 'Store', ...overrides }) as AuthenticatedUser;

const stockRow = (overrides = {}) => ({
  id: 'i1',
  sku: 'GLV-1',
  name: 'Gloves',
  unitOfMeasure: 'pcs',
  reorderPoint: 10,
  totalOnHand: 50,
  stockValue: '100.00',
  status: 'IN_STOCK',
  category: { name: 'PPE' },
  ...overrides,
});

describe('DashboardService', () => {
  let prisma: MockPrisma;
  let inventory: { getStockOverview: jest.Mock };
  let service: DashboardService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    prisma = createMockPrisma();
    prisma.appSetting.findMany.mockResolvedValue([]);
    inventory = { getStockOverview: jest.fn().mockResolvedValue([]) };
    service = new DashboardService(prisma, inventory as unknown as InventoryService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('management view', () => {
    beforeEach(() => {
      inventory.getStockOverview.mockResolvedValue([
        stockRow(),
        stockRow({ id: 'i2', sku: 'BLT-1', name: 'Bolts', totalOnHand: 0, status: 'OUT_OF_STOCK', stockValue: '0.00', category: null }),
        stockRow({ id: 'i3', sku: 'NUT-1', name: 'Nuts', totalOnHand: 3, status: 'LOW_STOCK', stockValue: '12.50', category: { name: 'Fasteners' } }),
        stockRow({ id: 'i4', sku: 'CBL-1', name: 'Cable', totalOnHand: 2, status: 'LOW_STOCK', stockValue: '0.00', category: { name: 'Empty value' } }),
      ]);
      prisma.purchase.findMany.mockResolvedValue([
        { date: new Date('2026-10-05'), total: '100.00' },
        { date: new Date('2026-10-20'), total: '50.50' },
        { date: new Date('2026-08-15'), total: '30.00' },
        { date: new Date('2026-04-01'), total: '999.00' }, // before the six-month window
      ] as never);
      prisma.consumption.findMany.mockResolvedValue([
        { date: new Date('2026-10-06'), total: '20.00', item: { name: 'Gloves' }, department: { name: 'Workshop' } },
        { date: new Date('2026-10-07'), total: '5.00', item: { name: 'Gloves' }, department: null },
        { date: new Date('2026-09-30'), total: '8.00', item: { name: 'Bolts' }, department: { name: 'Workshop' } },
        { date: new Date('2026-06-01'), total: '70.00', item: { name: 'Old stock' }, department: { name: 'Workshop' } }, // older than 90 days
        { date: new Date('2026-04-01'), total: '1.00', item: { name: 'Ancient' }, department: null }, // outside both windows
      ] as never);
      prisma.appointment.count.mockImplementation((args) => {
        const where = (args as { where: { status: unknown } }).where;
        return Promise.resolve(typeof where.status === 'string' ? 4 : 2) as never;
      });
      prisma.user.count.mockResolvedValue(3);
      prisma.appointment.findMany.mockResolvedValue([{ id: 'appt-1' }] as never);
      prisma.stockTransaction.findMany.mockResolvedValue([{ id: 'txn-1' }] as never);
    });

    it('summarises stock, spend, usage and what needs attention', async () => {
      const result = await service.forUser(user('admin'));

      expect(result.kind).toBe('management');
      if (result.kind !== 'management') return;
      expect(result.kpi).toEqual({ items: 4, stockValue: 112.5, low: 2, out: 1, purchasesMonth: 150.5, consumptionMonth: 25 });
      expect(result.actions).toEqual({ pendingAppointments: 4, todayAppointments: 2, accessRequests: 3 });
      expect(result.monthly).toEqual({
        labels: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
        purchases: [0, 0, 0, 30, 0, 150.5],
        consumption: [0, 70, 0, 0, 8, 25],
      });
      expect(result.byCategory).toEqual([
        { name: 'PPE', value: 100 },
        { name: 'Fasteners', value: 12.5 },
      ]);
      expect(result.topConsumed).toEqual([
        { name: 'Gloves', value: 25 },
        { name: 'Bolts', value: 8 },
      ]);
      expect(result.byDepartment).toEqual([
        { name: 'Workshop', value: 28 },
        { name: 'No department', value: 5 },
      ]);
      expect(result.upcoming).toEqual([{ id: 'appt-1' }]);
      expect(result.recent).toEqual([{ id: 'txn-1' }]);
    });

    it('lists stock alerts, emptiest first, without the healthy items', async () => {
      const result = await service.forUser(user('inventory'));

      if (result.kind !== 'management') throw new Error('expected the management view');
      expect(result.alerts.map((a) => [a.sku, a.onHand, a.status])).toEqual([
        ['BLT-1', 0, 'OUT_OF_STOCK'],
        ['CBL-1', 2, 'LOW_STOCK'],
        ['NUT-1', 3, 'LOW_STOCK'],
      ]);
      expect(result.alerts[0]).toEqual({ id: 'i2', sku: 'BLT-1', name: 'Bolts', unit: 'pcs', onHand: 0, reorderPoint: 10, status: 'OUT_OF_STOCK' });
    });

    it('only counts sign-up requests for admins', async () => {
      const result = await service.forUser(user('inventory'));

      if (result.kind !== 'management') throw new Error('expected the management view');
      expect(result.actions.accessRequests).toBe(0);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it.each(['finance', 'viewer'])('gives %s the store-wide view too', async (role) => {
      expect((await service.forUser(user(role))).kind).toBe('management');
    });

    it('works on an empty store', async () => {
      inventory.getStockOverview.mockResolvedValue([]);
      prisma.purchase.findMany.mockResolvedValue([] as never);
      prisma.consumption.findMany.mockResolvedValue([] as never);

      const result = await service.forUser(user('admin'));

      if (result.kind !== 'management') throw new Error('expected the management view');
      expect(result.kpi).toMatchObject({ items: 0, stockValue: 0, purchasesMonth: 0 });
      expect(result.byCategory).toEqual([]);
      expect(result.monthly.purchases).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('counts months back across a year boundary', async () => {
      jest.setSystemTime(new Date('2026-02-10T09:00:00.000Z'));

      const result = await service.forUser(user('admin'));

      if (result.kind !== 'management') throw new Error('expected the management view');
      expect(result.monthly.labels).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    });
  });

  describe('my view', () => {
    const appt = (overrides = {}) => ({
      id: 'a',
      status: 'PENDING',
      date: new Date('2026-10-26'),
      time: '09:00',
      feedback: null,
      feedbackAt: null,
      ...overrides,
    });

    it('counts my appointments by status and lists what is coming up', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        appt({ id: 'past', status: 'PENDING', date: new Date('2026-10-01') }),
        appt({ id: 'today', status: 'APPROVED', date: new Date('2026-10-22') }),
        appt({ id: 'soon', status: 'PENDING', date: new Date('2026-10-26') }),
        appt({ id: 'done', status: 'COMPLETED', date: new Date('2026-10-10') }),
        appt({ id: 'no', status: 'DECLINED', date: new Date('2026-10-30') }),
        appt({ id: 'gone', status: 'CANCELLED', date: new Date('2026-10-31') }),
      ] as never);

      const result = await service.forUser(user('staff'));

      expect(result.kind).toBe('mine');
      if (result.kind !== 'mine') return;
      expect(result.name).toBe('Ann Store');
      expect(result.counts).toEqual({ pending: 2, approved: 1, completed: 1, declined: 1 });
      expect(result.upcoming.map((a) => a.id)).toEqual(['today', 'soon']);
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { requesterId: 'u1' } }));
    });

    it('shows the latest five pieces of feedback, newest first', async () => {
      const rows = Array.from({ length: 7 }, (_, i) =>
        appt({ id: `f${i}`, feedback: `note ${i}`, feedbackAt: new Date(`2026-10-0${i + 1}T10:00:00Z`) }),
      );
      prisma.appointment.findMany.mockResolvedValue([...rows, appt({ id: 'none' }), appt({ id: 'undated', feedback: 'x', feedbackAt: null })] as never);

      const result = await service.forUser(user('staff'));

      if (result.kind !== 'mine') throw new Error('expected my view');
      expect(result.feedback.map((a) => a.id)).toEqual(['f6', 'f5', 'f4', 'f3', 'f2']);
    });

    it('limits the upcoming list to six', async () => {
      prisma.appointment.findMany.mockResolvedValue(
        Array.from({ length: 9 }, (_, i) => appt({ id: `a${i}`, date: new Date('2026-11-01') })) as never,
      );

      const result = await service.forUser(user('staff'));

      if (result.kind !== 'mine') throw new Error('expected my view');
      expect(result.upcoming).toHaveLength(6);
    });

    it('names me by email when I have no name, and treats a roleless user as ordinary staff', async () => {
      prisma.appointment.findMany.mockResolvedValue([] as never);

      const result = await service.forUser(user(null, { firstName: '', lastName: '' }));

      if (result.kind !== 'mine') throw new Error('expected my view');
      expect(result.name).toBe('a@acme.test');
      expect(result.counts).toEqual({ pending: 0, approved: 0, completed: 0, declined: 0 });
    });
  });
});
