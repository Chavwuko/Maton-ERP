import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../../auth/cognito-auth.guard';
import { createMockPrisma, MockPrisma } from '../../../../test/utils/mock-prisma';
import type { EmailNotifier } from '../../mail/email-notifier';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';

const user = { id: 'user-1' } as AuthenticatedUser;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0', meta: { target: 'scheduleId' } });

// Only the date is faked, so the awaited mocks still resolve normally.
// 2026-10-27 10:00 UTC is still the 27th in the store's default zone.
const freezeToday = () =>
  jest.useFakeTimers({
    now: new Date('2026-10-27T10:00:00.000Z'),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });

const stored = (overrides = {}) => ({
  id: 'sch-1',
  organizationId: 'org-1',
  assetId: 'a1',
  title: 'Grease bearings',
  description: null,
  priority: 'MEDIUM',
  leadDays: 7,
  active: true,
  basis: 'FIXED',
  intervalValue: 1,
  intervalUnit: 'MONTHS',
  nextDueDate: day('2026-11-01'),
  assignedToId: null,
  createdById: 'user-9',
  asset: { assetTag: 'PUMP-1', name: 'Pump' },
  assignedTo: null,
  ...overrides,
});

const valid = { assetId: 'a1', title: 'Grease bearings', intervalValue: 1, intervalUnit: 'MONTHS', firstDueDate: '2026-12-01' };

describe('MaintenanceSchedulesService', () => {
  let prisma: MockPrisma;
  let notifier: { scheduledWorkOrder: jest.Mock };
  let service: MaintenanceSchedulesService;

  beforeEach(() => {
    freezeToday();
    prisma = createMockPrisma();
    notifier = { scheduledWorkOrder: jest.fn() };
    service = new MaintenanceSchedulesService(prisma, notifier as unknown as EmailNotifier);
    prisma.appSetting.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('findAll / findOne', () => {
    beforeEach(() => {
      prisma.maintenanceSchedule.findMany.mockResolvedValue([
        stored({ id: 'late', nextDueDate: day('2026-10-01') }),
        stored({ id: 'soon', nextDueDate: day('2026-10-30') }),
        stored({ id: 'far', nextDueDate: day('2027-03-01') }),
        stored({ id: 'off', active: false }),
      ] as never);
    });

    it('lists schedules with where each one stands today', async () => {
      const result = await service.findAll({});

      expect(result.map((s) => [s.id, s.dueStatus])).toEqual([
        ['late', 'OVERDUE'],
        ['soon', 'DUE_SOON'],
        ['far', 'UPCOMING'],
        ['off', 'PAUSED'],
      ]);
      expect(prisma.maintenanceSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: undefined, assetId: undefined, active: undefined }, orderBy: { nextDueDate: 'asc' } }),
      );
    });

    it('filters by organisation, asset and active', async () => {
      await service.findAll({ organizationId: 'org-1', assetId: 'a1', active: 'true' });
      await service.findAll({ active: 'false' });

      expect(prisma.maintenanceSchedule.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { organizationId: 'org-1', assetId: 'a1', active: true } }));
      expect(prisma.maintenanceSchedule.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ active: false }) }));
    });

    it('filters by due status', async () => {
      const result = await service.findAll({ dueStatus: 'OVERDUE' });

      expect(result.map((s) => s.id)).toEqual(['late']);
    });

    it('rejects an unknown due status', async () => {
      await expect(service.findAll({ dueStatus: 'SOMETIME' })).rejects.toThrow(BadRequestException);
    });

    it('reads one, and 404s for an unknown id', async () => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValueOnce(stored() as never);
      await expect(service.findOne('sch-1')).resolves.toMatchObject({ id: 'sch-1', dueStatus: 'DUE_SOON' });

      prisma.maintenanceSchedule.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', organizationId: 'org-1', status: 'ACTIVE' } as never);
      prisma.maintenanceSchedule.create.mockResolvedValue({ id: 'sch-1' } as never);
      prisma.maintenanceSchedule.findMany.mockResolvedValue([]);
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(stored() as never);
    });

    it('saves the schedule under the asset’s organisation, with defaults left to the database', async () => {
      const result = await service.create(valid, user);

      expect(prisma.maintenanceSchedule.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          assetId: 'a1',
          title: 'Grease bearings',
          intervalValue: 1,
          intervalUnit: 'MONTHS',
          nextDueDate: day('2026-12-01'),
          createdById: 'user-1',
        },
      });
      expect(result).toMatchObject({ id: 'sch-1' });
    });

    it('takes the optional fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', status: 'ACTIVE' } as never);

      await service.create(
        { ...valid, title: '  Grease bearings ', description: ' Use the red grease ', basis: 'FLOATING', priority: 'HIGH', leadDays: 14, assignedToId: 'u2' },
        user,
      );

      expect(prisma.maintenanceSchedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Grease bearings',
          description: 'Use the red grease',
          basis: 'FLOATING',
          priority: 'HIGH',
          leadDays: 14,
          assignedToId: 'u2',
        }),
      });
    });

    it('opens the work order straight away when it is already inside its lead time', async () => {
      prisma.maintenanceSchedule.findMany.mockResolvedValue([stored({ nextDueDate: day('2026-10-28') })] as never);
      prisma.workOrder.create.mockResolvedValue({ id: 'wo-1', title: 'Grease bearings' } as never);

      await service.create({ ...valid, firstDueDate: '2026-10-28' }, user);

      expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
    });

    it('404s for an unknown asset and refuses a decommissioned one', async () => {
      prisma.asset.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(valid, user)).rejects.toThrow(NotFoundException);

      prisma.asset.findUnique.mockResolvedValueOnce({ id: 'a1', status: 'DECOMMISSIONED' } as never);
      await expect(service.create(valid, user)).rejects.toThrow('decommissioned');
      expect(prisma.maintenanceSchedule.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing title', { title: undefined }, 'title is required'],
      ['a blank title', { title: '  ' }, 'title is required'],
      ['an unknown basis', { basis: 'WHENEVER' }, 'basis must be one of'],
      ['an unknown priority', { priority: 'URGENT' }, 'priority must be one of'],
      ['a negative lead time', { leadDays: -1 }, 'leadDays must be a whole number'],
      ['a fractional lead time', { leadDays: 1.5 }, 'leadDays must be a whole number'],
      ['a lead time over a year', { leadDays: 366 }, 'leadDays must be a whole number'],
      ['a missing interval', { intervalValue: undefined }, 'intervalValue must be a whole number'],
      ['an interval of zero', { intervalValue: 0 }, 'intervalValue must be a whole number'],
      ['a huge interval', { intervalValue: 1001 }, 'intervalValue must be a whole number'],
      ['a missing unit', { intervalUnit: undefined }, 'intervalUnit must be one of'],
      ['an unknown unit', { intervalUnit: 'FORTNIGHTS' }, 'intervalUnit must be one of'],
      ['a missing first date', { firstDueDate: undefined }, 'firstDueDate'],
      ['an impossible first date', { firstDueDate: '2026-02-30' }, 'firstDueDate'],
    ])('rejects %s', async (_name, change, message) => {
      await expect(service.create({ ...valid, ...change } as never, user)).rejects.toThrow(message);
      expect(prisma.maintenanceSchedule.create).not.toHaveBeenCalled();
    });

    it('rejects an assignee who does not exist or cannot sign in', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.create({ ...valid, assignedToId: 'ghost' }, user)).rejects.toThrow(NotFoundException);

      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2', status: 'PENDING' } as never);
      await expect(service.create({ ...valid, assignedToId: 'u2' }, user)).rejects.toThrow('active account');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(stored() as never);
      prisma.maintenanceSchedule.update.mockResolvedValue({} as never);
      prisma.maintenanceSchedule.findMany.mockResolvedValue([]);
    });

    it('changes only what was sent, then checks whether a work order is now due', async () => {
      await service.update('sch-1', {
        title: ' New title ',
        description: '',
        intervalValue: 3,
        intervalUnit: 'WEEKS',
        nextDueDate: '2026-11-20',
        active: false,
        assignedToId: '',
      });

      expect(prisma.maintenanceSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sch-1' },
        data: {
          title: 'New title',
          description: null,
          intervalValue: 3,
          intervalUnit: 'WEEKS',
          nextDueDate: day('2026-11-20'),
          active: false,
          assignedToId: null,
        },
      });
      expect(prisma.maintenanceSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'sch-1' }) }));
    });

    it('can send nothing at all', async () => {
      await service.update('sch-1', {});

      expect(prisma.maintenanceSchedule.update).toHaveBeenCalledWith({ where: { id: 'sch-1' }, data: {} });
    });

    it('rejects a blank title and a non-boolean active flag', async () => {
      await expect(service.update('sch-1', { title: ' ' })).rejects.toThrow('title cannot be blank');
      await expect(service.update('sch-1', { active: 'yes' as never })).rejects.toThrow('active must be true or false');
      expect(prisma.maintenanceSchedule.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown schedule', async () => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the schedule', async () => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(stored() as never);
      prisma.maintenanceSchedule.delete.mockResolvedValue({ id: 'sch-1' } as never);

      await expect(service.remove('sch-1')).resolves.toEqual({ id: 'sch-1' });
      expect(prisma.maintenanceSchedule.delete).toHaveBeenCalledWith({ where: { id: 'sch-1' } });
    });

    it('404s for an unknown schedule', async () => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
      expect(prisma.maintenanceSchedule.delete).not.toHaveBeenCalled();
    });
  });

  describe('generateDue', () => {
    it('opens a preventive work order for each schedule inside its lead time and emails the assignee', async () => {
      const assignee = { id: 'u2', email: 'tech@acme.test' };
      prisma.maintenanceSchedule.findMany.mockResolvedValue([
        stored({ assignedToId: 'u2', assignedTo: assignee, description: 'Red grease' }),
        stored({ id: 'sch-far', nextDueDate: day('2026-12-30') }),
      ] as never);
      prisma.workOrder.create.mockResolvedValue({ id: 'wo-1', title: 'Grease bearings' } as never);

      const result = await service.generateDue();

      expect(result).toEqual({ created: 1, workOrders: [{ id: 'wo-1', title: 'Grease bearings', assetTag: 'PUMP-1' }] });
      expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
      expect(prisma.workOrder.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          assetId: 'a1',
          title: 'Grease bearings',
          description: 'Red grease',
          type: 'PREVENTIVE',
          priority: 'MEDIUM',
          dueDate: day('2026-11-01'),
          assignedToId: 'u2',
          requestedById: 'user-9',
          scheduleId: 'sch-1',
        },
      });
      expect(notifier.scheduledWorkOrder).toHaveBeenCalledWith({
        title: 'Grease bearings',
        assetTag: 'PUMP-1',
        assetName: 'Pump',
        dueDate: day('2026-11-01'),
        assignee,
      });
    });

    it('only looks at active schedules on assets still in service, due within a year, or just the one asked for', async () => {
      prisma.maintenanceSchedule.findMany.mockResolvedValue([]);

      await service.generateDue();
      await service.generateDue('sch-1');

      expect(prisma.maintenanceSchedule.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: undefined, active: true, asset: { status: { not: 'DECOMMISSIONED' } }, nextDueDate: { lte: day('2027-10-27') } },
        }),
      );
      expect(prisma.maintenanceSchedule.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ id: 'sch-1' }) }));
    });

    it('opens one on the due date itself and for one that is already overdue', async () => {
      prisma.maintenanceSchedule.findMany.mockResolvedValue([
        stored({ id: 'today', nextDueDate: day('2026-10-27'), leadDays: 0 }),
        stored({ id: 'late', nextDueDate: day('2026-09-01'), leadDays: 0 }),
        stored({ id: 'not-yet', nextDueDate: day('2026-10-28'), leadDays: 0 }),
      ] as never);
      prisma.workOrder.create.mockResolvedValue({ id: 'wo', title: 't' } as never);

      const result = await service.generateDue();

      expect(result.created).toBe(2);
    });

    it('skips one that already has a work order open, and carries on', async () => {
      prisma.maintenanceSchedule.findMany.mockResolvedValue([stored({ id: 'one' }), stored({ id: 'two' })] as never);
      prisma.workOrder.create.mockRejectedValueOnce(duplicate()).mockResolvedValueOnce({ id: 'wo-2', title: 't' } as never);

      const result = await service.generateDue();

      expect(result.created).toBe(1);
      expect(notifier.scheduledWorkOrder).toHaveBeenCalledTimes(1);
    });

    it('does not hide any other failure', async () => {
      prisma.maintenanceSchedule.findMany.mockResolvedValue([stored()] as never);

      prisma.workOrder.create.mockRejectedValueOnce(new Error('db down'));
      await expect(service.generateDue()).rejects.toThrow('db down');

      prisma.workOrder.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('other', { code: 'P2003', clientVersion: '5.20.0' }),
      );
      await expect(service.generateDue()).rejects.toThrow('other');
    });
  });

  describe('onWorkOrderClosed', () => {
    const next = async (schedule: object, status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED') => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(stored(schedule) as never);
      await service.onWorkOrderClosed(prisma, 'sch-1', status);
      return prisma.maintenanceSchedule.update.mock.calls.at(-1)![0] as { where: object; data: { nextDueDate: Date; lastCompletedDate?: Date } };
    };

    it('does nothing when the schedule has since been deleted', async () => {
      prisma.maintenanceSchedule.findUnique.mockResolvedValue(null);

      await service.onWorkOrderClosed(prisma, 'sch-1', 'COMPLETED');

      expect(prisma.maintenanceSchedule.update).not.toHaveBeenCalled();
    });

    it('skips this occurrence when the work order is cancelled, without counting it as done', async () => {
      await expect(next({ nextDueDate: day('2026-11-01') }, 'CANCELLED')).resolves.toEqual({
        where: { id: 'sch-1' },
        data: { nextDueDate: day('2026-12-01') },
      });
    });

    it('FIXED: stays on the calendar after an on-time completion', async () => {
      await expect(next({ basis: 'FIXED', nextDueDate: day('2026-11-01') })).resolves.toEqual({
        where: { id: 'sch-1' },
        data: { lastCompletedDate: day('2026-10-27'), nextDueDate: day('2026-12-01') },
      });
    });

    it('FIXED: catches up to the first date after today when the job was done late', async () => {
      await expect(next({ basis: 'FIXED', nextDueDate: day('2026-07-15') })).resolves.toEqual({
        where: { id: 'sch-1' },
        data: { lastCompletedDate: day('2026-10-27'), nextDueDate: day('2026-11-15') },
      });
    });

    it('FIXED: stops chasing after a very long lapse instead of looping forever', async () => {
      const update = await next({ basis: 'FIXED', intervalValue: 1, intervalUnit: 'DAYS', nextDueDate: day('2000-01-01') });

      // 2 Jan 2000 (one step) + 5000 more steps
      expect(update.data.nextDueDate).toEqual(day('2013-09-10'));
    });

    it('FLOATING: counts from the day it was finished', async () => {
      await expect(next({ basis: 'FLOATING', nextDueDate: day('2026-07-15') })).resolves.toEqual({
        where: { id: 'sch-1' },
        data: { lastCompletedDate: day('2026-10-27'), nextDueDate: day('2026-11-27') },
      });
    });

    it('judges "today" in the store’s own time zone', async () => {
      // 23:30 UTC on the 27th is already the 28th in Lagos.
      jest.setSystemTime(new Date('2026-10-27T23:30:00.000Z'));

      const update = await next({ basis: 'FLOATING' });

      expect(update.data.lastCompletedDate).toEqual(day('2026-10-28'));
    });
  });
});
