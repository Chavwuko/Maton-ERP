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
});
