import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import type { InventoryService } from '../inventory/inventory.service';
import { AppointmentsService } from './appointments.service';

// "Now" is Thursday 2026-10-22, 10:00 in Lagos (09:00 UTC). Saturday the 24th
// is outside the default working days; Monday the 26th is an ordinary day.
const NOW = new Date('2026-10-22T09:00:00.000Z');
const THURSDAY = '2026-10-22';
const SATURDAY = '2026-10-24';
const MONDAY = '2026-10-26';

const user = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'req-1',
  cognitoSub: 'sub-1',
  email: 'ann@acme.test',
  roleName: 'staff',
  departmentId: 'dept-1',
  status: 'ACTIVE',
  firstName: 'Ann',
  lastName: 'Store',
  phone: null,
  rejectionReason: null,
  ...overrides,
});

const item = (id: string, name = 'Hex Bolt') => ({ id, name, unitOfMeasure: 'pcs', deletedAt: null });

describe('AppointmentsService', () => {
  let prisma: MockPrisma;
  let inventory: { issueStock: jest.Mock };
  let service: AppointmentsService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    prisma = createMockPrisma();
    prisma.appSetting.findMany.mockResolvedValue([]); // the default schedule
    inventory = { issueStock: jest.fn().mockResolvedValue({}) };
    service = new AppointmentsService(prisma, inventory as unknown as InventoryService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('schedule', () => {
    it('getSchedule returns the defaults when nothing is stored', async () => {
      await expect(service.getSchedule()).resolves.toMatchObject({ workStart: '08:00', slotMinutes: 30 });
    });

    it('updateSchedule validates, saves and returns the new schedule', async () => {
      const next = await service.updateSchedule({ slotMinutes: 60, slotCapacity: 2 });

      expect(next).toMatchObject({ slotMinutes: 60, slotCapacity: 2, workStart: '08:00' });
      expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(6);
    });

    it('updateSchedule rejects an invalid schedule without saving anything', async () => {
      await expect(service.updateSchedule({ slotMinutes: 7 })).rejects.toThrow(BadRequestException);
      expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
    });
  });

  describe('slots', () => {
    it('rejects a malformed date', async () => {
      await expect(service.slots('tomorrow')).rejects.toThrow('date must look like 2026-10-24');
      await expect(service.slots(undefined as never)).rejects.toThrow(BadRequestException);
    });

    it('reports a non-working day with no slots', async () => {
      await expect(service.slots(SATURDAY)).resolves.toEqual({ working: false, slots: [] });
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('greys out slots already gone today and slots that are full', async () => {
      prisma.appointment.findMany.mockResolvedValue([{ time: '11:00' }] as never);

      const { working, slots } = await service.slots(THURSDAY);

      expect(working).toBe(true);
      expect(slots).toHaveLength(18); // 08:00 .. 16:30, 30 minutes each
      expect(slots[0]).toEqual({ time: '08:00', booked: 0, capacity: 1, available: false }); // past
      expect(slots.find((s) => s.time === '10:00')?.available).toBe(false); // starts now: too late
      expect(slots.find((s) => s.time === '10:30')?.available).toBe(true);
      expect(slots.find((s) => s.time === '11:00')).toEqual({ time: '11:00', booked: 1, capacity: 1, available: false });
      expect(slots[slots.length - 1].time).toBe('16:30');
    });

    it('leaves every slot of a future day open, counting bookings against capacity', async () => {
      prisma.appSetting.findMany.mockResolvedValue([{ key: 'appointments.slotCapacity', value: '2' }] as never);
      prisma.appointment.findMany.mockResolvedValue([{ time: '09:00' }, { time: '09:00' }, { time: '09:30' }] as never);

      const { slots } = await service.slots(MONDAY);

      expect(slots.find((s) => s.time === '08:00')?.available).toBe(true);
      expect(slots.find((s) => s.time === '09:00')).toMatchObject({ booked: 2, capacity: 2, available: false });
      expect(slots.find((s) => s.time === '09:30')).toMatchObject({ booked: 1, available: true });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith({
        where: { date: new Date(MONDAY), status: { in: ['PENDING', 'APPROVED'] } },
        select: { time: true },
      });
    });

    it('treats a past day as fully unavailable', async () => {
      prisma.appointment.findMany.mockResolvedValue([] as never);
      const { slots } = await service.slots('2026-10-21');

      expect(slots.every((slot) => !slot.available)).toBe(true);
    });
  });

  describe('book', () => {
    const request = { date: MONDAY, time: '09:00', subject: ' Collect gloves ', type: 'Site visit', details: ' for the crew ' };

    beforeEach(() => {
      prisma.appointment.findMany.mockResolvedValue([] as never);
      prisma.appointment.create.mockResolvedValue({ id: 'appt-1' } as never);
    });

    it('creates a pending appointment for the signed-in user, in their department', async () => {
      await expect(service.book(request, user())).resolves.toEqual({ id: 'appt-1' });

      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            requesterId: 'req-1',
            departmentId: 'dept-1',
            date: new Date(MONDAY),
            time: '09:00',
            type: 'Site visit',
            subject: 'Collect gloves',
            details: 'for the crew',
            items: { create: [] },
          },
        }),
      );
    });

    it('turns an unknown type into Other and blank details into null', async () => {
      await service.book({ ...request, type: 'Haircut', details: '  ' }, user());
      await service.book({ date: MONDAY, time: '09:30', subject: 'Hi' }, user());

      const calls = prisma.appointment.create.mock.calls.map(([arg]) => arg.data);
      expect(calls[0]).toMatchObject({ type: 'Other', details: null });
      expect(calls[1]).toMatchObject({ type: 'Other', details: null });
    });

    it('lists the requested items, merging repeats and rounding quantities', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([item('i1'), item('i2', 'Gloves')] as never);

      await service.book(
        {
          ...request,
          items: [
            { itemId: 'i1', quantity: 2.0004 },
            { itemId: 'i1', quantity: 3 },
            { itemId: 'i2', quantity: 10 },
          ],
        },
        user(),
      );

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['i1', 'i2'] }, deletedAt: null },
      });
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                { itemId: 'i1', quantity: 5 },
                { itemId: 'i2', quantity: 10 },
              ],
            },
          }),
        }),
      );
    });

    it('404s when a requested item no longer exists', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([] as never);

      await expect(service.book({ ...request, items: [{ itemId: 'gone', quantity: 1 }] }, user())).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      [{ itemId: 'i1', quantity: 0 }],
      [{ itemId: 'i1', quantity: -2 }],
      [{ itemId: 'i1', quantity: 'many' }],
      [{ itemId: '', quantity: 1 }],
    ])('refuses an item line %j', async (line) => {
      await expect(service.book({ ...request, items: [line as never] }, user())).rejects.toThrow(
        'Each item needs a positive quantity',
      );
    });

    it('needs a subject', async () => {
      await expect(service.book({ ...request, subject: '  ' }, user())).rejects.toThrow('Please give your appointment a subject');
      await expect(service.book({ ...request, subject: undefined as never }, user())).rejects.toThrow(BadRequestException);
    });

    it('needs a real date', async () => {
      await expect(service.book({ ...request, date: '2026-02-30' }, user())).rejects.toThrow('date must look like');
    });

    it.each(['9am', '08:15', '07:30', '16:45', '17:00', ''])('refuses the time %j, which is not a slot', async (time) => {
      await expect(service.book({ ...request, time }, user())).rejects.toThrow('Please choose a valid time slot');
    });

    it('refuses a missing time', async () => {
      await expect(service.book({ ...request, time: undefined as never }, user())).rejects.toThrow('valid time slot');
    });

    it('refuses a slot that has already started today, or an earlier day', async () => {
      await expect(service.book({ ...request, date: THURSDAY, time: '10:00' }, user())).rejects.toThrow(
        'Please choose a future date and time',
      );
      await expect(service.book({ ...request, date: '2026-10-21' }, user())).rejects.toThrow('future date');
    });

    it('accepts a later slot today', async () => {
      await expect(service.book({ ...request, date: THURSDAY, time: '10:30' }, user())).resolves.toBeDefined();
    });

    it('refuses a non-working day', async () => {
      await expect(service.book({ ...request, date: SATURDAY }, user())).rejects.toThrow(
        'Appointments are only available on working days',
      );
    });

    it('refuses a full slot', async () => {
      prisma.appointment.findMany.mockResolvedValue([{ requesterId: 'someone' }] as never);

      await expect(service.book(request, user())).rejects.toThrow('That time slot is full');
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('refuses a second appointment for the same person at the same time', async () => {
      prisma.appSetting.findMany.mockResolvedValue([{ key: 'appointments.slotCapacity', value: '3' }] as never);
      prisma.appointment.findMany.mockResolvedValue([{ requesterId: 'req-1' }] as never);

      await expect(service.book(request, user())).rejects.toThrow('You already have an appointment at that time');
    });
  });

  describe('findMine / findAll', () => {
    it('findMine lists only the requester, newest first', async () => {
      prisma.appointment.findMany.mockResolvedValue([] as never);

      await service.findMine('req-1');

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { requesterId: 'req-1' }, orderBy: [{ date: 'desc' }, { time: 'desc' }] }),
      );
    });

    it('findAll applies no filters by default', async () => {
      prisma.appointment.findMany.mockResolvedValue([] as never);

      await service.findAll({});

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: undefined, date: undefined }, take: 1000 }),
      );
    });

    it('findAll filters by status and a date range, or just one end of it', async () => {
      prisma.appointment.findMany.mockResolvedValue([] as never);

      await service.findAll({ status: 'PENDING', from: '2026-10-01', to: '2026-10-31' });
      await service.findAll({ from: '2026-10-01' });
      await service.findAll({ to: '2026-10-31' });

      const wheres = prisma.appointment.findMany.mock.calls.map(([arg]) => arg?.where);
      expect(wheres[0]).toEqual({
        status: 'PENDING',
        date: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31') },
      });
      expect(wheres[1]).toEqual({ status: undefined, date: { gte: new Date('2026-10-01'), lte: undefined } });
      expect(wheres[2]).toEqual({ status: undefined, date: { gte: undefined, lte: new Date('2026-10-31') } });
    });

    it('findAll rejects an unknown status or a malformed date', () => {
      expect(() => service.findAll({ status: 'LOST' })).toThrow('status must be one of');
      expect(() => service.findAll({ from: 'soon' })).toThrow('date must look like');
      expect(() => service.findAll({ to: 'later' })).toThrow('date must look like');
    });
  });

  describe('cancel', () => {
    const existing = (overrides = {}) => ({ id: 'appt-1', requesterId: 'req-1', status: 'PENDING', feedback: null, ...overrides });

    beforeEach(() => {
      prisma.appointment.update.mockResolvedValue({ id: 'appt-1' } as never);
    });

    it('404s for an unknown appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.cancel('nope', user())).rejects.toThrow(NotFoundException);
    });

    it('lets the requester cancel their own, leaving the feedback alone', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing({ status: 'APPROVED', feedback: 'See you then' }) as never);

      await service.cancel('appt-1', user());

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1' },
          data: { status: 'CANCELLED', feedbackById: 'req-1', feedbackAt: expect.any(Date), feedback: 'See you then' },
        }),
      );
    });

    it('lets the store cancel anyone\'s, saying so unless it already left feedback', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing() as never);
      await service.cancel('appt-1', user({ id: 'keeper', roleName: 'inventory' }));
      prisma.appointment.findUnique.mockResolvedValue(existing({ feedback: 'Bring a pass' }) as never);
      await service.cancel('appt-1', user({ id: 'boss', roleName: 'admin' }));

      const feedbacks = prisma.appointment.update.mock.calls.map(([arg]) => arg.data.feedback);
      expect(feedbacks).toEqual(['Cancelled by the store.', 'Bring a pass']);
    });

    it('stops anyone else cancelling it', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing() as never);

      await expect(service.cancel('appt-1', user({ id: 'other', roleName: 'hse' }))).rejects.toThrow(ForbiddenException);
      await expect(service.cancel('appt-1', user({ id: 'other', roleName: null }))).rejects.toThrow(ForbiddenException);
    });

    it('only cancels appointments that still hold a slot', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing({ status: 'COMPLETED' }) as never);

      await expect(service.cancel('appt-1', user())).rejects.toThrow('already completed');
    });
  });

  describe('review', () => {
    const requester = { id: 'req-1', firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' };
    const existing = (overrides = {}) => ({
      id: 'appt-1',
      status: 'PENDING',
      requesterId: 'req-1',
      departmentId: 'dept-1',
      subject: 'Collect gloves',
      feedback: null,
      requester,
      ...overrides,
    });
    const reviewer = user({ id: 'keeper', roleName: 'inventory' });

    beforeEach(() => {
      prisma.appointment.findUnique.mockResolvedValue(existing() as never);
      prisma.appointment.updateMany.mockResolvedValue({ count: 1 } as never);
      prisma.appointment.findUniqueOrThrow.mockResolvedValue({ id: 'appt-1', status: 'APPROVED' } as never);
    });

    it('rejects an unknown decision', async () => {
      await expect(service.review('appt-1', { decision: 'MAYBE' }, reviewer)).rejects.toThrow('decision must be');
    });

    it('404s for an unknown appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.review('nope', { decision: 'APPROVED' }, reviewer)).rejects.toThrow(NotFoundException);
    });

    it('approves without needing feedback, keeping any earlier feedback', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing({ feedback: 'Earlier note' }) as never);

      const result = await service.review('appt-1', { decision: 'APPROVED' }, reviewer);

      expect(result).toEqual({ id: 'appt-1', status: 'APPROVED' });
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'PENDING' },
        data: {
          status: 'APPROVED',
          feedback: 'Earlier note',
          feedbackById: 'keeper',
          feedbackAt: expect.any(Date),
          issuedNote: undefined,
        },
      });
      expect(inventory.issueStock).not.toHaveBeenCalled();
    });

    it('needs feedback to decline or complete', async () => {
      await expect(service.review('appt-1', { decision: 'DECLINED', feedback: ' ' }, reviewer)).rejects.toThrow(
        'Please add feedback for the requester',
      );
      await expect(service.review('appt-1', { decision: 'COMPLETED' }, reviewer)).rejects.toThrow('add feedback');
    });

    it('declines with feedback and ignores any items sent along', async () => {
      await service.review(
        'appt-1',
        { decision: 'DECLINED', feedback: ' Out of stock ', issue: [{ itemId: 'i1', quantity: 1 }], warehouseId: 'wh-1' },
        reviewer,
      );

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED', feedback: 'Out of stock' }) }),
      );
      expect(inventory.issueStock).not.toHaveBeenCalled();
    });

    it('only moves along allowed paths', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing({ status: 'APPROVED' }) as never);
      await expect(service.review('appt-1', { decision: 'APPROVED' }, reviewer)).rejects.toThrow('already approved');

      prisma.appointment.findUnique.mockResolvedValue(existing({ status: 'COMPLETED' }) as never);
      await expect(service.review('appt-1', { decision: 'DECLINED', feedback: 'x' }, reviewer)).rejects.toThrow(
        'already completed',
      );
      prisma.appointment.findUnique.mockResolvedValue(existing({ status: 'CANCELLED' }) as never);
      await expect(service.review('appt-1', { decision: 'APPROVED' }, reviewer)).rejects.toThrow('already cancelled');
    });

    it('can complete an approved appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existing({ status: 'APPROVED' }) as never);

      await service.review('appt-1', { decision: 'COMPLETED', feedback: 'Collected' }, reviewer);

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1', status: 'APPROVED' },
          data: expect.objectContaining({ status: 'COMPLETED', issuedNote: 'No items issued' }),
        }),
      );
    });

    it('issues each line through the inventory engine, charged to the requester\'s department', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([item('i1', 'Hex Bolt'), item('i2', 'Gloves')] as never);

      await service.review(
        'appt-1',
        {
          decision: 'COMPLETED',
          feedback: 'Handed over',
          warehouseId: 'wh-1',
          issue: [
            { itemId: 'i1', quantity: 4 },
            { itemId: 'i2', quantity: 10 },
          ],
        },
        reviewer,
      );

      expect(inventory.issueStock).toHaveBeenCalledTimes(2);
      expect(inventory.issueStock).toHaveBeenNthCalledWith(
        1,
        prisma,
        {
          warehouseId: 'wh-1',
          itemId: 'i1',
          quantity: 4,
          date: '2026-10-22',
          departmentId: 'dept-1',
          projectId: undefined,
          issuedTo: 'Ann Store',
          purpose: 'Collect gloves',
        },
        'keeper',
        'appt-1',
      );
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ issuedNote: 'Issued: 4 pcs Hex Bolt; 10 pcs Gloves' }),
        }),
      );
    });

    it('charges a project when the requester has no department, naming them by email if they have no name', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        existing({ departmentId: null, requester: { ...requester, firstName: '', lastName: '' } }) as never,
      );
      prisma.inventoryItem.findMany.mockResolvedValue([item('i1')] as never);

      await service.review(
        'appt-1',
        { decision: 'COMPLETED', feedback: 'Done', warehouseId: 'wh-1', projectId: 'proj-1', issue: [{ itemId: 'i1', quantity: 1 }] },
        reviewer,
      );

      expect(inventory.issueStock).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ departmentId: undefined, projectId: 'proj-1', issuedTo: 'ann@acme.test' }),
        'keeper',
        'appt-1',
      );
    });

    it('needs a warehouse, and a department or project, before issuing anything', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([item('i1')] as never);
      const issue = [{ itemId: 'i1', quantity: 1 }];

      await expect(service.review('appt-1', { decision: 'COMPLETED', feedback: 'Done', issue }, reviewer)).rejects.toThrow(
        'Choose the warehouse',
      );

      prisma.appointment.findUnique.mockResolvedValue(existing({ departmentId: null }) as never);
      await expect(
        service.review('appt-1', { decision: 'COMPLETED', feedback: 'Done', warehouseId: 'wh-1', issue }, reviewer),
      ).rejects.toThrow('has no department');
      expect(inventory.issueStock).not.toHaveBeenCalled();
    });

    it('404s when an item to issue does not exist, and stops on a shortage', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([] as never);
      const issue = [{ itemId: 'gone', quantity: 1 }];
      await expect(
        service.review('appt-1', { decision: 'COMPLETED', feedback: 'Done', warehouseId: 'wh-1', issue }, reviewer),
      ).rejects.toThrow(NotFoundException);

      prisma.inventoryItem.findMany.mockResolvedValue([item('i1')] as never);
      inventory.issueStock.mockRejectedValue(new BadRequestException('Insufficient stock'));
      await expect(
        service.review('appt-1', { decision: 'COMPLETED', feedback: 'Done', warehouseId: 'wh-1', issue: [{ itemId: 'i1', quantity: 1 }] }, reviewer),
      ).rejects.toThrow('Insufficient stock');
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('409s if someone else changed the appointment in the meantime', async () => {
      prisma.appointment.updateMany.mockResolvedValue({ count: 0 } as never);

      await expect(service.review('appt-1', { decision: 'APPROVED' }, reviewer)).rejects.toThrow(ConflictException);
    });
  });
});
