import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { AssetsService } from './assets.service';

const dup = (target: string) =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0', meta: { target } });

const user = { id: 'user-1' } as AuthenticatedUser;
const base = { organizationId: 'org-1', assetTag: 'PUMP-001', name: 'Pump', category: 'Rotating' };
const ann = { id: 'u-ann', firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' };

// A stored asset as prisma returns it with the open-assignment include.
const stored = (overrides = {}) => ({
  id: 'a1',
  organizationId: 'org-1',
  status: 'ACTIVE',
  condition: 'GOOD',
  purchaseDate: null,
  warrantyExpiry: null,
  assignments: [] as unknown[],
  ...overrides,
});

describe('AssetsService', () => {
  let prisma: MockPrisma;
  let service: AssetsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AssetsService(prisma);
  });

  describe('findAll / findMine', () => {
    it('lists assets with their current holder as one object, not a list', async () => {
      const holder = { id: 'asg-1', assignee: ann, department: null };
      prisma.asset.findMany.mockResolvedValue([stored({ assignments: [holder] }), stored({ id: 'a2' })] as never);

      const result = await service.findAll({});

      expect(result[0]).toMatchObject({ id: 'a1', currentAssignment: holder });
      expect(result[0]).not.toHaveProperty('assignments');
      expect(result[1].currentAssignment).toBeNull();
    });

    it('applies every filter', async () => {
      prisma.asset.findMany.mockResolvedValue([] as never);

      await service.findAll({
        organizationId: 'org-1',
        status: 'ACTIVE',
        projectId: 'p1',
        departmentId: 'd1',
        condition: 'FAIR',
        assignedToId: 'u1',
        search: '  pump ',
      });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            status: 'ACTIVE',
            projectId: 'p1',
            departmentId: 'd1',
            condition: 'FAIR',
            assignments: { some: { assigneeId: 'u1', returnedAt: null } },
            OR: [
              { assetTag: { contains: 'pump', mode: 'insensitive' } },
              { name: { contains: 'pump', mode: 'insensitive' } },
              { serialNumber: { contains: 'pump', mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('applies no filters by default, and treats a blank search as none', async () => {
      prisma.asset.findMany.mockResolvedValue([] as never);

      await service.findAll({ search: '   ' });

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignments: undefined, OR: undefined, status: undefined, condition: undefined }),
        }),
      );
    });

    it('refuses an unknown status or condition', async () => {
      await expect(service.findAll({ status: 'LOST' })).rejects.toThrow('status must be one of');
      await expect(service.findAll({ condition: 'WRECKED' })).rejects.toThrow('condition must be one of');
    });

    it('findMine lists what the person holds', async () => {
      prisma.asset.findMany.mockResolvedValue([] as never);

      await service.findMine('u1');

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ assignments: { some: { assigneeId: 'u1', returnedAt: null } } }) }),
      );
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the asset with work orders and its current holder', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', workOrders: [], assignments: [] } as never);

      await expect(service.findOne('a1')).resolves.toEqual({ id: 'a1', workOrders: [], currentAssignment: null });
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.asset.create.mockResolvedValue({ id: 'a1', assignments: [] } as never);
    });

    it('creates the asset with just the required fields', async () => {
      await service.create(base);

      expect(prisma.asset.create).toHaveBeenCalledWith(expect.objectContaining({ data: { ...base } }));
    });

    it('stores the full record, trimming text and converting dates and cost', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', organizationId: 'org-1' } as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'd1' } as never);
      prisma.project.findUnique.mockResolvedValue({ id: 'p1' } as never);

      await service.create({
        ...base,
        location: ' Bay 3 ',
        serialNumber: ' SN-1 ',
        make: 'Grundfos',
        model: 'CR-45',
        purchaseDate: '2026-01-15',
        purchaseCost: 1234.567,
        vendorId: 'v1',
        warrantyExpiry: '2028-01-15',
        condition: 'NEW',
        notes: ' Needs a guard ',
        departmentId: 'd1',
        projectId: 'p1',
      });

      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            ...base,
            location: 'Bay 3',
            serialNumber: 'SN-1',
            make: 'Grundfos',
            model: 'CR-45',
            purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
            purchaseCost: new Prisma.Decimal('1234.57'),
            vendorId: 'v1',
            warrantyExpiry: new Date('2028-01-15T00:00:00.000Z'),
            condition: 'NEW',
            notes: 'Needs a guard',
            departmentId: 'd1',
            projectId: 'p1',
          },
        }),
      );
    });

    it('turns blank text into nothing', async () => {
      await service.create({ ...base, serialNumber: '  ', notes: '' });

      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ serialNumber: null, notes: null }) }),
      );
    });

    it('names the tag in a duplicate-tag conflict and the serial number in a duplicate-serial one', async () => {
      prisma.asset.create.mockRejectedValue(dup('assetTag'));
      await expect(service.create(base)).rejects.toThrow(/Asset tag "PUMP-001" already exists/);

      prisma.asset.create.mockRejectedValue(dup('serialNumber'));
      await expect(service.create({ ...base, serialNumber: 'SN-1' })).rejects.toThrow(/Serial number "SN-1" is already used/);
      await expect(service.create(base)).rejects.toThrow(ConflictException);
    });

    it('treats a conflict with no detail as a tag clash, and rethrows unrelated errors', async () => {
      prisma.asset.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' }));
      await expect(service.create(base)).rejects.toThrow(/Asset tag/);

      prisma.asset.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('other', { code: 'P2003', clientVersion: '5.20.0' }));
      await expect(service.create(base)).rejects.toThrow('other');
      prisma.asset.create.mockRejectedValue(new Error('boom'));
      await expect(service.create(base)).rejects.toThrow('boom');
    });

    describe('validation', () => {
      it.each([
        [{ purchaseDate: '15/01/2026' }, 'purchaseDate must be a date'],
        [{ purchaseDate: '2026-02-30' }, 'purchaseDate must be a date'],
        [{ warrantyExpiry: 'soon' }, 'warrantyExpiry must be a date'],
        [{ purchaseCost: -1 }, 'purchaseCost must be zero or more'],
        [{ purchaseCost: Number.NaN }, 'purchaseCost must be zero or more'],
        [{ condition: 'WRECKED' }, 'condition must be one of'],
        [{ purchaseDate: '2026-06-01', warrantyExpiry: '2026-01-01' }, 'warranty cannot expire before'],
      ])('refuses %j', async (extra, message) => {
        await expect(service.create({ ...base, ...extra })).rejects.toThrow(message);
        expect(prisma.asset.create).not.toHaveBeenCalled();
      });

      it('404s on an unknown supplier, department or project', async () => {
        prisma.vendor.findUnique.mockResolvedValue(null);
        await expect(service.create({ ...base, vendorId: 'v9' })).rejects.toThrow('Vendor v9 not found');

        prisma.department.findUnique.mockResolvedValue(null);
        await expect(service.create({ ...base, departmentId: 'd9' })).rejects.toThrow('Department d9 not found');

        prisma.project.findUnique.mockResolvedValue(null);
        await expect(service.create({ ...base, projectId: 'p9' })).rejects.toThrow('Project p9 not found');
      });

      it('refuses a supplier from another organization', async () => {
        prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', organizationId: 'org-2' } as never);

        await expect(service.create({ ...base, vendorId: 'v1' })).rejects.toThrow('different organization');
      });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue(stored() as never);
      prisma.asset.update.mockResolvedValue({ id: 'a1', assignments: [] } as never);
    });

    it('404s for an unknown asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(service.update('a1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('changes only what was sent', async () => {
      await service.update('a1', { name: ' New name ', category: 'Pumps', condition: 'FAIR' });

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1' }, data: { name: 'New name', category: 'Pumps', condition: 'FAIR' } }),
      );
    });

    it('does nothing to fields that were not sent', async () => {
      await service.update('a1', {});

      expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
    });

    it('clears optional fields sent as null or blank', async () => {
      await service.update('a1', {
        location: null,
        serialNumber: '',
        purchaseDate: null,
        purchaseCost: null,
        warrantyExpiry: '',
        vendorId: null,
        departmentId: '',
        projectId: null,
        notes: null,
      } as never);

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            location: null,
            serialNumber: null,
            purchaseDate: null,
            purchaseCost: null,
            warrantyExpiry: null,
            vendorId: null,
            departmentId: null,
            projectId: null,
            notes: null,
          },
        }),
      );
    });

    it('clears a blank purchase cost', async () => {
      await service.update('a1', { purchaseCost: '' as never });

      expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { purchaseCost: null } }));
    });

    it('refuses to blank the tag, name or category', async () => {
      await expect(service.update('a1', { assetTag: ' ' })).rejects.toThrow('assetTag cannot be blank');
      await expect(service.update('a1', { name: '' })).rejects.toThrow('name cannot be blank');
      await expect(service.update('a1', { category: ' ' })).rejects.toThrow('category cannot be blank');
    });

    it('checks the warranty against the existing purchase date', async () => {
      prisma.asset.findUnique.mockResolvedValue(stored({ purchaseDate: new Date('2026-06-01') }) as never);
      await expect(service.update('a1', { warrantyExpiry: '2026-01-01' })).rejects.toThrow('warranty cannot expire before');

      prisma.asset.findUnique.mockResolvedValue(stored({ warrantyExpiry: new Date('2026-01-01') }) as never);
      await expect(service.update('a1', { purchaseDate: '2026-06-01' })).rejects.toThrow('warranty cannot expire before');

      await expect(service.update('a1', { warrantyExpiry: '2027-01-01' })).resolves.toBeDefined();
    });

    describe('status', () => {
      it('allows decommissioning and reinstating', async () => {
        await service.update('a1', { status: 'DECOMMISSIONED' });
        prisma.asset.findUnique.mockResolvedValue(stored({ status: 'DECOMMISSIONED' }) as never);
        await service.update('a1', { status: 'ACTIVE' });

        expect(prisma.asset.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { status: 'DECOMMISSIONED' } }));
        expect(prisma.asset.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { status: 'ACTIVE' } }));
      });

      it('will not set UNDER_MAINTENANCE by hand, or an unknown status', async () => {
        await expect(service.update('a1', { status: 'UNDER_MAINTENANCE' })).rejects.toThrow('only be set to ACTIVE or DECOMMISSIONED');
        await expect(service.update('a1', { status: 'LOST' })).rejects.toThrow(BadRequestException);
      });

      it('will not change the status of an asset under maintenance', async () => {
        prisma.asset.findUnique.mockResolvedValue(stored({ status: 'UNDER_MAINTENANCE' }) as never);

        await expect(service.update('a1', { status: 'DECOMMISSIONED' })).rejects.toThrow('under maintenance');
      });

      it('will not decommission an asset that is checked out', async () => {
        prisma.asset.findUnique.mockResolvedValue(stored({ assignments: [{ id: 'asg-1' }] }) as never);

        await expect(service.update('a1', { status: 'DECOMMISSIONED' })).rejects.toThrow('Check the asset back in');
      });
    });

    it('turns a duplicate tag or serial into a conflict', async () => {
      prisma.asset.update.mockRejectedValue(dup('assetTag'));
      await expect(service.update('a1', { assetTag: 'X-1' })).rejects.toThrow(/Asset tag "X-1" already exists/);

      prisma.asset.update.mockRejectedValue(dup('serialNumber'));
      await expect(service.update('a1', { serialNumber: 'SN-2' })).rejects.toThrow(/Serial number "SN-2"/);

      prisma.asset.update.mockRejectedValue(new Error('boom'));
      await expect(service.update('a1', { name: 'X' })).rejects.toThrow('boom');
    });
  });

  describe('checkOut', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue(stored() as never);
      prisma.user.findUnique.mockResolvedValue({ id: 'u-ann', status: 'ACTIVE' } as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'd1' } as never);
      prisma.assetAssignment.create.mockResolvedValue({ id: 'asg-1' } as never);
    });

    it('records who took it, in what condition, and returns the asset with its new holder', async () => {
      const result = await service.checkOut('a1', { assigneeId: 'u-ann', expectedReturn: '2026-12-01', condition: 'FAIR', notes: ' for the shutdown ' }, user);

      expect(prisma.assetAssignment.create).toHaveBeenCalledWith({
        data: {
          assetId: 'a1',
          assigneeId: 'u-ann',
          departmentId: undefined,
          expectedReturn: new Date('2026-12-01T00:00:00.000Z'),
          conditionOut: 'FAIR',
          notes: 'for the shutdown',
          assignedById: 'user-1',
        },
      });
      expect(result).toBeDefined();
    });

    it('defaults to the asset\'s own condition, and allows a department on its own', async () => {
      await service.checkOut('a1', { departmentId: 'd1' }, user);

      expect(prisma.assetAssignment.create).toHaveBeenCalledWith({
        data: {
          assetId: 'a1',
          assigneeId: undefined,
          departmentId: 'd1',
          expectedReturn: undefined,
          conditionOut: 'GOOD',
          notes: null,
          assignedById: 'user-1',
        },
      });
    });

    it('404s for an unknown asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow(NotFoundException);
    });

    it('only checks out an active asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(stored({ status: 'UNDER_MAINTENANCE' }) as never);
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('under maintenance and cannot be checked out');

      prisma.asset.findUnique.mockResolvedValue(stored({ status: 'DECOMMISSIONED' }) as never);
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('decommissioned and cannot be checked out');
    });

    it('says who already has it', async () => {
      const heldBy = (assignee: unknown, department: unknown) =>
        prisma.asset.findUnique.mockResolvedValue(stored({ assignments: [{ assignee, department }] }) as never);

      heldBy(ann, null);
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('Already checked out to Ann Store');
      heldBy({ ...ann, firstName: '', lastName: '' }, null);
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('Already checked out to ann@acme.test');
      heldBy(null, { name: 'Workshop' });
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('Already checked out to Workshop');
      heldBy(null, null);
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow(ConflictException);
    });

    it('needs a person or a department', async () => {
      await expect(service.checkOut('a1', {}, user)).rejects.toThrow('Choose a person or a department');
    });

    it('needs a real person with an active account, and a real department', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.checkOut('a1', { assigneeId: 'nobody' }, user)).rejects.toThrow('User nobody not found');

      prisma.user.findUnique.mockResolvedValue({ id: 'u', status: 'PENDING' } as never);
      await expect(service.checkOut('a1', { assigneeId: 'u' }, user)).rejects.toThrow('does not have an active account');

      prisma.department.findUnique.mockResolvedValue(null);
      await expect(service.checkOut('a1', { departmentId: 'd9' }, user)).rejects.toThrow('Department d9 not found');
    });

    it('validates the condition and the return date', async () => {
      await expect(service.checkOut('a1', { assigneeId: 'u-ann', condition: 'WRECKED' }, user)).rejects.toThrow('condition must be one of');
      await expect(service.checkOut('a1', { assigneeId: 'u-ann', expectedReturn: 'soon' }, user)).rejects.toThrow('expectedReturn must be a date');
    });

    it('loses gracefully when someone else checks it out first', async () => {
      prisma.assetAssignment.create.mockRejectedValue(dup('assetId'));
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('just checked out by someone else');

      prisma.assetAssignment.create.mockRejectedValue(new Error('boom'));
      await expect(service.checkOut('a1', { assigneeId: 'u-ann' }, user)).rejects.toThrow('boom');
    });
  });

  describe('checkIn', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', assignments: [] } as never);
      prisma.assetAssignment.findFirst.mockResolvedValue({ id: 'asg-1' } as never);
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 1 } as never);
    });

    it('closes the open assignment and records the condition it came back in', async () => {
      await service.checkIn('a1', { condition: 'POOR', notes: ' cracked casing ' }, user);

      expect(prisma.assetAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: 'asg-1', returnedAt: null },
        data: { returnedAt: expect.any(Date), conditionIn: 'POOR', returnNotes: 'cracked casing', returnedById: 'user-1' },
      });
      expect(prisma.asset.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { condition: 'POOR' } });
    });

    it('leaves the asset\'s condition alone when none is given', async () => {
      await service.checkIn('a1', {}, user);

      expect(prisma.assetAssignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ conditionIn: undefined, returnNotes: null }) }),
      );
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown asset, and refuses an unknown condition', async () => {
      prisma.asset.findUnique.mockResolvedValueOnce(null);
      await expect(service.checkIn('a1', {}, user)).rejects.toThrow(NotFoundException);

      await expect(service.checkIn('a1', { condition: 'WRECKED' }, user)).rejects.toThrow('condition must be one of');
    });

    it('refuses an asset that is not checked out', async () => {
      prisma.assetAssignment.findFirst.mockResolvedValue(null);

      await expect(service.checkIn('a1', {}, user)).rejects.toThrow('not checked out');
    });

    it('409s if someone else checked it in at the same moment', async () => {
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 0 } as never);

      await expect(service.checkIn('a1', { condition: 'GOOD' }, user)).rejects.toThrow(ConflictException);
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });
  });

  describe('assignments and history', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', assignments: [] } as never);
    });

    it('lists the custody history newest first', async () => {
      prisma.assetAssignment.findMany.mockResolvedValue([{ id: 'asg-1' }] as never);

      await expect(service.assignments('a1')).resolves.toEqual([{ id: 'asg-1' }]);

      expect(prisma.assetAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId: 'a1' }, orderBy: { assignedAt: 'desc' } }),
      );
    });

    it('lists the changes made to the asset from the activity log', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }] as never);

      await expect(service.history('a1')).resolves.toEqual([{ id: 'log-1' }]);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityType: 'Asset', entityId: 'a1' }, orderBy: { createdAt: 'desc' }, take: 100 }),
      );
    });

    it('summarises the completed work: count, preventive share, total cost and the last visit', async () => {
      const lastServiceAt = new Date('2026-10-20T09:00:00.000Z');
      prisma.workOrder.findMany.mockResolvedValue([
        { id: 'wo-2', type: 'PREVENTIVE', cost: new Prisma.Decimal('100.10'), completedAt: lastServiceAt },
        { id: 'wo-1', type: 'CORRECTIVE', cost: null, completedAt: new Date('2026-09-01') },
        { id: 'wo-0', type: 'CORRECTIVE', cost: new Prisma.Decimal('50.20'), completedAt: new Date('2026-08-01') },
      ] as never);

      const result = await service.serviceHistory('a1');

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId: 'a1', status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } }),
      );
      expect(result.workOrders).toHaveLength(3);
      expect(result.totals).toEqual({ count: 3, preventive: 1, cost: new Prisma.Decimal('150.30'), lastServiceAt });
    });

    it('has no last visit and a zero total for an asset that was never serviced', async () => {
      prisma.workOrder.findMany.mockResolvedValue([]);

      const result = await service.serviceHistory('a1');

      expect(result.totals).toEqual({ count: 0, preventive: 0, cost: new Prisma.Decimal(0), lastServiceAt: null });
    });

    it('404s for an unknown asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(service.assignments('x')).rejects.toThrow(NotFoundException);
      await expect(service.serviceHistory('x')).rejects.toThrow(NotFoundException);
      await expect(service.history('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('depreciation settings', () => {
    const dec = (value: string) => new Prisma.Decimal(value);
    const settings = { purchaseCost: 12000, purchaseDate: '2026-01-15', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 60 };

    describe('creating', () => {
      beforeEach(() => {
        prisma.asset.create.mockResolvedValue({ id: 'a1', assignments: [] } as never);
      });

      it('stores the method, life, salvage value and start date', async () => {
        await service.create({ ...base, ...settings, salvageValue: 2000.456, depreciationStartDate: '2026-02-01' });

        expect(prisma.asset.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              depreciationMethod: 'STRAIGHT_LINE',
              usefulLifeMonths: 60,
              salvageValue: dec('2000.46'),
              depreciationStartDate: new Date('2026-02-01T00:00:00.000Z'),
            }),
          }),
        );
      });

      it('starts from the purchase date when no start date is given', async () => {
        await expect(service.create({ ...base, ...settings })).resolves.toBeDefined();
      });

      it('lets an asset that is not depreciated leave the rest empty, and clears blanks', async () => {
        await service.create({ ...base, depreciationMethod: 'NONE', usefulLifeMonths: '' as never, salvageValue: null as never });

        expect(prisma.asset.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ depreciationMethod: 'NONE', usefulLifeMonths: null, salvageValue: null }) }),
        );
      });

      it.each([
        [{ depreciationMethod: 'MAGIC' }, 'depreciationMethod must be one of'],
        [{ usefulLifeMonths: 0 }, 'usefulLifeMonths must be a whole number from 1 to 600'],
        [{ usefulLifeMonths: 601 }, 'usefulLifeMonths must be a whole number from 1 to 600'],
        [{ usefulLifeMonths: 1.5 }, 'usefulLifeMonths must be a whole number from 1 to 600'],
        [{ salvageValue: -1 }, 'salvageValue must be zero or more'],
        [{ depreciationStartDate: 'soon' }, 'depreciationStartDate must be a date'],
        [{ purchaseCost: undefined }, 'Depreciation needs a purchase cost'],
        [{ usefulLifeMonths: undefined }, 'Depreciation needs a useful life in months'],
        [{ purchaseDate: undefined }, 'Depreciation needs a start date'],
        [{ salvageValue: 13000 }, 'salvage value cannot be more than the purchase cost'],
      ])('refuses %j', async (change, message) => {
        await expect(service.create({ ...base, ...settings, ...change })).rejects.toThrow(message);
        expect(prisma.asset.create).not.toHaveBeenCalled();
      });
    });

    describe('updating', () => {
      const depreciated = (overrides = {}) =>
        stored({
          purchaseCost: dec('1000'),
          purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
          depreciationMethod: 'STRAIGHT_LINE',
          usefulLifeMonths: 12,
          salvageValue: null,
          depreciationStartDate: new Date('2026-02-01T00:00:00.000Z'),
          ...overrides,
        });

      beforeEach(() => {
        prisma.asset.findUnique.mockResolvedValue(depreciated() as never);
        prisma.asset.update.mockResolvedValue({ id: 'a1', assignments: [] } as never);
      });

      it('leaves a complete setup alone when something else changes', async () => {
        await service.update('a1', { name: 'New name' });

        expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'New name' } }));
      });

      it('switches the method on an asset that already has a cost and a life', async () => {
        await service.update('a1', { depreciationMethod: 'DECLINING_BALANCE', salvageValue: 100 });

        expect(prisma.asset.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { depreciationMethod: 'DECLINING_BALANCE', salvageValue: dec('100') } }),
        );
      });

      it('starts from the purchase date once the start date is cleared', async () => {
        await expect(service.update('a1', { depreciationStartDate: null })).resolves.toBeDefined();
        expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { depreciationStartDate: null } }));
      });

      it('falls back to the purchase date when there was never a start date', async () => {
        prisma.asset.findUnique.mockResolvedValue(depreciated({ depreciationStartDate: null }) as never);

        await expect(service.update('a1', { name: 'X' })).resolves.toBeDefined();
      });

      it('checks the result, not just what was sent', async () => {
        await expect(service.update('a1', { purchaseCost: null })).rejects.toThrow('Depreciation needs a purchase cost');
        await expect(service.update('a1', { usefulLifeMonths: null })).rejects.toThrow('Depreciation needs a useful life');
        await expect(service.update('a1', { purchaseCost: 50 })).resolves.toBeDefined();

        prisma.asset.findUnique.mockResolvedValue(depreciated({ depreciationStartDate: null, purchaseDate: null }) as never);
        await expect(service.update('a1', { name: 'X' })).rejects.toThrow('Depreciation needs a start date');

        prisma.asset.findUnique.mockResolvedValue(depreciated({ salvageValue: dec('800') }) as never);
        await expect(service.update('a1', { purchaseCost: 500 })).rejects.toThrow('salvage value cannot be more');
        expect(prisma.asset.update).toHaveBeenCalledTimes(1);
      });

      it('lets depreciation be switched off along with its cost', async () => {
        await expect(service.update('a1', { depreciationMethod: 'NONE', purchaseCost: null })).resolves.toBeDefined();
      });
    });
  });

  describe('valuation', () => {
    const dec = (value: string) => new Prisma.Decimal(value);
    const priced = (overrides = {}) => ({
      id: 'a1',
      assetTag: 'PUMP-001',
      name: 'Pump',
      category: 'Rotating',
      status: 'ACTIVE',
      purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
      purchaseCost: dec('12000'),
      depreciationMethod: 'STRAIGHT_LINE',
      usefulLifeMonths: 60,
      salvageValue: dec('2000'),
      depreciationStartDate: null,
      ...overrides,
    });

    beforeEach(() => {
      prisma.appSetting.findMany.mockResolvedValue([]);
    });

    describe('one asset', () => {
      it('gives the book value on a day, and the year-by-year schedule', async () => {
        prisma.asset.findUnique.mockResolvedValue(priced() as never);

        const result = await service.valuation('a1', '2027-01-15');

        expect(result).toMatchObject({
          asOf: '2027-01-15',
          method: 'STRAIGHT_LINE',
          usefulLifeMonths: 60,
          monthsElapsed: 12,
          fullyDepreciated: false,
          depreciationStartDate: new Date('2026-01-15T00:00:00.000Z'),
        });
        expect(result.cost?.toNumber()).toBe(12000);
        expect(result.accumulatedDepreciation?.toNumber()).toBe(2000);
        expect(result.bookValue?.toNumber()).toBe(10000);
        expect(result.schedule).toHaveLength(5);
      });

      it('starts from the depreciation start date when there is one', async () => {
        prisma.asset.findUnique.mockResolvedValue(priced({ depreciationStartDate: new Date('2026-07-01T00:00:00.000Z') }) as never);

        const result = await service.valuation('a1', '2027-01-01');

        expect(result.monthsElapsed).toBe(6);
      });

      it('is worth its cost when it is not depreciated, with no schedule', async () => {
        prisma.asset.findUnique.mockResolvedValue(priced({ depreciationMethod: 'NONE' }) as never);

        const result = await service.valuation('a1', '2030-01-01');

        expect(result.bookValue?.toNumber()).toBe(12000);
        expect(result.accumulatedDepreciation?.toNumber()).toBe(0);
        expect(result.schedule).toEqual([]);
        expect(result.depreciationStartDate).toBeNull();
      });

      it('cannot be valued without a cost, and treats a half-finished setup as not depreciated', async () => {
        prisma.asset.findUnique.mockResolvedValueOnce(priced({ purchaseCost: null }) as never);
        await expect(service.valuation('a1', '2027-01-01')).resolves.toMatchObject({ cost: null, bookValue: null, accumulatedDepreciation: null });

        prisma.asset.findUnique.mockResolvedValueOnce(priced({ usefulLifeMonths: null }) as never);
        await expect(service.valuation('a1', '2027-01-01')).resolves.toMatchObject({ schedule: [] });

        prisma.asset.findUnique.mockResolvedValueOnce(priced({ purchaseDate: null }) as never);
        await expect(service.valuation('a1', '2027-01-01')).resolves.toMatchObject({ schedule: [] });
      });

      it('with no salvage value writes the whole cost off', async () => {
        prisma.asset.findUnique.mockResolvedValue(priced({ salvageValue: null, usefulLifeMonths: 12 }) as never);

        const result = await service.valuation('a1', '2030-01-01');

        expect(result.bookValue?.toNumber()).toBe(0);
        expect(result.fullyDepreciated).toBe(true);
      });

      it('uses today, in the store’s time zone, when no day is given', async () => {
        jest.useFakeTimers({
          now: new Date('2027-01-14T23:30:00.000Z'),
          doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
        });
        prisma.asset.findUnique.mockResolvedValue(priced() as never);

        // 23:30 UTC on the 14th is already the 15th in Lagos.
        const result = await service.valuation('a1');
        const blank = await service.valuation('a1', '');
        jest.useRealTimers();

        expect(result.asOf).toBe('2027-01-15');
        expect(result.monthsElapsed).toBe(12);
        expect(blank.asOf).toBe('2027-01-15');
      });

      it('404s for an unknown asset and 400s for a bad day', async () => {
        prisma.asset.findUnique.mockResolvedValueOnce(null);
        await expect(service.valuation('x')).rejects.toThrow(NotFoundException);

        prisma.asset.findUnique.mockResolvedValueOnce(priced() as never);
        await expect(service.valuation('a1', '15/01/2027')).rejects.toThrow('asOf must be a date');
      });
    });

    describe('the register', () => {
      it('values every asset and totals them overall and by category', async () => {
        prisma.asset.findMany.mockResolvedValue([
          priced({ id: 'a1', assetTag: 'A', category: 'Rotating' }),
          priced({ id: 'a2', assetTag: 'B', category: 'Rotating', depreciationMethod: 'NONE', purchaseCost: dec('500') }),
          priced({ id: 'a3', assetTag: 'C', category: 'Vehicles', purchaseCost: dec('6000'), usefulLifeMonths: 12, salvageValue: null }),
          priced({ id: 'a4', assetTag: 'D', category: 'Vehicles', purchaseCost: null }),
        ] as never);

        const report = await service.valuationReport({ asOf: '2027-01-15' });

        expect(report.rows.map((row) => [row.assetTag, row.bookValue?.toNumber() ?? null])).toEqual([
          ['A', 10000],
          ['B', 500],
          ['C', 0],
          ['D', null],
        ]);
        expect(report.totals.count).toBe(3);
        expect(report.totals.cost.toNumber()).toBe(18500);
        expect(report.totals.accumulatedDepreciation.toNumber()).toBe(8000);
        expect(report.totals.bookValue.toNumber()).toBe(10500);
        expect(report.totals.notValued).toBe(1);
        expect(report.totals.byCategory.map((row) => [row.category, row.count, row.bookValue.toNumber()])).toEqual([
          ['Rotating', 2, 10500],
          ['Vehicles', 1, 0],
        ]);
      });

      it('leaves out decommissioned assets unless asked, and can be limited to one organization', async () => {
        prisma.asset.findMany.mockResolvedValue([]);

        await service.valuationReport({ organizationId: 'org-1', asOf: '2027-01-15' });
        await service.valuationReport({ asOf: '2027-01-15', includeDecommissioned: 'true' });

        expect(prisma.asset.findMany).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ where: { organizationId: 'org-1', status: { not: 'DECOMMISSIONED' } } }),
        );
        expect(prisma.asset.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { organizationId: undefined, status: undefined } }));
      });

      it('reports zero totals for an empty register, and rejects a bad day', async () => {
        prisma.asset.findMany.mockResolvedValue([]);

        const report = await service.valuationReport({ asOf: '2027-01-15' });

        expect(report.totals).toMatchObject({ count: 0, notValued: 0, byCategory: [] });
        await expect(service.valuationReport({ asOf: 'tomorrow' })).rejects.toThrow('asOf must be a date');
      });
    });
  });

  describe('dashboard', () => {
    // The generic groupBy signature defeats the deep mock's typing.
    const groupBy = () => prisma.asset.groupBy as unknown as jest.Mock;
    const dec = (value: string) => new Prisma.Decimal(value);
    const lines = (csv: string) => csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');

    beforeEach(() => {
      prisma.appSetting.findMany.mockResolvedValue([]);
    });

    it('counts the register, and lists what needs attention', async () => {
      groupBy()
        .mockResolvedValueOnce([
          { status: 'ACTIVE', _count: { _all: 7 } },
          { status: 'DECOMMISSIONED', _count: { _all: 2 } },
        ] as never)
        .mockResolvedValueOnce([{ condition: 'GOOD', _count: { _all: 5 } }] as never);
      prisma.assetAssignment.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
      prisma.assetAssignment.findMany.mockResolvedValue([{ id: 'asg-1' }] as never);
      prisma.asset.count.mockResolvedValue(3);
      // The warranty list first, then the register for its book value.
      prisma.asset.findMany.mockResolvedValueOnce([{ id: 'a1', assetTag: 'PUMP-1' }] as never).mockResolvedValueOnce([
        {
          id: 'a1', assetTag: 'PUMP-1', name: 'Pump', category: 'Rotating', status: 'ACTIVE', purchaseDate: null, purchaseCost: dec('1000'),
          depreciationMethod: 'NONE', usefulLifeMonths: null, salvageValue: null, depreciationStartDate: null,
        },
        { id: 'a2', assetTag: 'X', name: 'X', category: 'Rotating', status: 'ACTIVE', purchaseCost: null, depreciationMethod: 'NONE' },
      ] as never);
      prisma.workOrder.count.mockResolvedValue(6);
      prisma.maintenanceSchedule.findMany.mockResolvedValue([
        { active: true, nextDueDate: new Date('2020-01-01T00:00:00.000Z'), leadDays: 7 },
        { active: true, nextDueDate: new Date('2999-01-01T00:00:00.000Z'), leadDays: 7 },
        { active: true, nextDueDate: new Date(Date.now() + 2 * 86_400_000), leadDays: 7 },
      ] as never);

      const result = await service.dashboard({ organizationId: 'org-1' });

      expect(result).toMatchObject({
        assetCount: 9,
        byStatus: [{ label: 'ACTIVE', count: 7 }, { label: 'DECOMMISSIONED', count: 2 }],
        byCondition: [{ label: 'GOOD', count: 5 }],
        checkedOut: 4,
        overdueReturns: { count: 1, items: [{ id: 'asg-1' }] },
        warrantyExpiring: { count: 3, items: [{ id: 'a1', assetTag: 'PUMP-1' }] },
        maintenance: { openWorkOrders: 6, overdueSchedules: 1, dueSoonSchedules: 1 },
      });
      expect(result.totals.bookValue.toNumber()).toBe(1000);
      expect(result.totals.notValued).toBe(1);
      expect(prisma.workOrder.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', status: { in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] } } });
      expect(prisma.assetAssignment.count).toHaveBeenNthCalledWith(1, { where: { returnedAt: null, asset: { organizationId: 'org-1' } } });
      expect(prisma.assetAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, orderBy: { expectedReturn: 'asc' } }));
    });

    it('is all zeros for an empty register', async () => {
      groupBy().mockResolvedValue([]);
      prisma.assetAssignment.count.mockResolvedValue(0);
      prisma.assetAssignment.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.workOrder.count.mockResolvedValue(0);
      prisma.maintenanceSchedule.findMany.mockResolvedValue([]);

      const result = await service.dashboard({});

      expect(result).toMatchObject({
        assetCount: 0,
        byStatus: [],
        checkedOut: 0,
        maintenance: { openWorkOrders: 0, overdueSchedules: 0, dueSoonSchedules: 0 },
      });
      expect(result.totals.bookValue.toNumber()).toBe(0);
    });

    describe('spreadsheets', () => {
      const asset = (overrides = {}) => ({
        id: 'a1',
        assetTag: 'PUMP-1',
        name: 'Pump, main',
        category: 'Rotating',
        status: 'ACTIVE',
        condition: 'GOOD',
        location: 'Bay 3',
        make: 'Grundfos',
        model: 'CR-45',
        serialNumber: 'SN-1',
        purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
        warrantyExpiry: new Date('2028-01-15T00:00:00.000Z'),
        purchaseCost: dec('12000'),
        salvageValue: dec('2000'),
        depreciationMethod: 'STRAIGHT_LINE',
        usefulLifeMonths: 60,
        depreciationStartDate: null,
        department: { id: 'd1', name: 'Plant' },
        vendor: { id: 'v1', name: 'Apex' },
        assignments: [{ assignee: { firstName: 'Ann', lastName: 'Store', email: 'a@b.test' }, department: null }],
        ...overrides,
      });

      it('exports the register with its money columns', async () => {
        jest.useFakeTimers({
          now: new Date('2027-01-15T10:00:00.000Z'),
          doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
        });
        prisma.asset.findMany.mockResolvedValue([asset()] as never);

        const { filename, content } = await service.exportRegister({ organizationId: 'org-1', status: 'ACTIVE' }, true);
        jest.useRealTimers();

        expect(filename).toBe('assets-2027-01-15.csv');
        expect(prisma.asset.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', status: 'ACTIVE' }), orderBy: [{ category: 'asc' }, { assetTag: 'asc' }] }),
        );
        const [header, row] = lines(content);
        expect(header.endsWith('Purchase cost,Salvage value,Depreciation,Accumulated depreciation,Book value')).toBe(true);
        expect(row).toBe('PUMP-1,"Pump, main",Rotating,ACTIVE,GOOD,Bay 3,Plant,Grundfos,CR-45,SN-1,2026-01-15,Apex,2028-01-15,Ann Store,12000,2000,STRAIGHT_LINE,2000,10000');
      });

      it('leaves the money out for the staff role, and shows blanks and department holders', async () => {
        prisma.asset.findMany.mockResolvedValue([
          asset({
            purchaseDate: null, warrantyExpiry: null, department: null, vendor: null, location: null,
            assignments: [{ assignee: null, department: { name: 'Workshop' } }],
          }),
          asset({ assignments: [] }),
        ] as never);

        const { content } = await service.exportRegister({}, false);

        const [header, first, second] = lines(content);
        expect(header).toBe('Asset tag,Name,Category,Status,Condition,Location,Department,Make,Model,Serial number,Purchase date,Supplier,Warranty expires,Held by');
        expect(first).toBe('PUMP-1,"Pump, main",Rotating,ACTIVE,GOOD,,,Grundfos,CR-45,SN-1,,,,Workshop');
        expect(second.endsWith(',Apex,2028-01-15,')).toBe(true);
      });

      it('exports assets with no cost as blanks', async () => {
        prisma.asset.findMany.mockResolvedValue([asset({ purchaseCost: null, salvageValue: null, depreciationMethod: 'NONE' })] as never);

        const { content } = await service.exportRegister({}, true);

        expect(lines(content)[1].endsWith(',,,NONE,,')).toBe(true);
      });

      it('exports the valuation with a totals row', async () => {
        prisma.asset.findMany.mockResolvedValue([asset(), asset({ id: 'a2', assetTag: 'B', name: 'No cost', purchaseCost: null, depreciationMethod: 'NONE' })] as never);

        const { filename, content } = await service.exportValuation({ asOf: '2027-01-15' });

        expect(filename).toBe('asset-valuation-2027-01-15.csv');
        const rows = lines(content);
        expect(rows[0]).toBe('Asset tag,Name,Category,Status,Depreciation,Purchase cost,Accumulated depreciation,Book value,Fully depreciated');
        expect(rows[1]).toBe('PUMP-1,"Pump, main",Rotating,ACTIVE,STRAIGHT_LINE,12000,2000,10000,No');
        expect(rows[2]).toBe('B,No cost,Rotating,ACTIVE,NONE,,,,No');
        expect(rows[3]).toBe(',Total,,,,12000,2000,10000,');
      });

      it('marks a fully depreciated asset', async () => {
        prisma.asset.findMany.mockResolvedValue([asset()] as never);

        const { content } = await service.exportValuation({ asOf: '2040-01-01' });

        expect(lines(content)[1].endsWith(',2000,Yes')).toBe(true);
      });
    });
  });
});
