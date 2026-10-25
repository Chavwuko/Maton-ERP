import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import type { EmailNotifier } from '../mail/email-notifier';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: MockPrisma;
  let service: UsersService;
  let notifier: { accessRequested: jest.Mock; accessApproved: jest.Mock; accessRejected: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    notifier = { accessRequested: jest.fn(), accessApproved: jest.fn(), accessRejected: jest.fn() };
    service = new UsersService(prisma, notifier as unknown as EmailNotifier);
  });

  const user = { id: 'user-1', email: 'a@b.com', role: { id: 'role-1', name: 'admin' } };

  describe('findAll', () => {
    it('delegates straight to prisma.user.findMany with no filters by default', async () => {
      const users = [user];
      prisma.user.findMany.mockResolvedValue(users as never);

      const result = await service.findAll({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: undefined, isActive: undefined, status: undefined } }),
      );
      expect(result).toEqual(users);
    });

    it('filters by a single role name when given', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ role: 'document_control' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ role: { name: { in: ['document_control'] } } }) }),
      );
    });

    it('filters by multiple role names when given an array', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ role: ['document_control', 'admin'] });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: { name: { in: ['document_control', 'admin'] } } }),
        }),
      );
    });

    it('filters by isActive when given', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ isActive: false });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: false }) }),
      );
    });
  });

  describe('findOne', () => {
    it('404s when missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the user (with role) when found', async () => {
      prisma.user.findUnique.mockResolvedValue(user as never);

      await expect(service.findOne('user-1')).resolves.toEqual(user);
    });
  });

  describe('findAll by status', () => {
    it('filters by status when given', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await service.findAll({ status: 'PENDING' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });

    it('400s on an unknown status instead of letting prisma 500', async () => {
      expect(() => service.findAll({ status: 'BOGUS' as never })).toThrow(BadRequestException);
    });
  });

  describe('completeProfile', () => {
    const pending = { id: 'user-1', status: 'PENDING', role: null };

    it('saves the details, trims them, and stamps requestedAt', async () => {
      prisma.user.findUnique.mockResolvedValue(pending as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'dept-1' } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.completeProfile('user-1', {
        firstName: ' Pat ',
        lastName: ' Pending ',
        phone: ' 555 ',
        departmentId: 'dept-1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            firstName: 'Pat',
            lastName: 'Pending',
            phone: '555',
            departmentId: 'dept-1',
            requestedAt: expect.any(Date),
          },
        }),
      );
    });

    it('stores a blank phone and department as null', async () => {
      prisma.user.findUnique.mockResolvedValue(pending as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.completeProfile('user-1', { firstName: 'Pat', lastName: 'Pending', phone: '  ' });

      expect(prisma.department.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: null, departmentId: null }) }),
      );
    });

    it('stores a missing phone as null', async () => {
      prisma.user.findUnique.mockResolvedValue(pending as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.completeProfile('user-1', { firstName: 'Pat', lastName: 'Pending' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: null }) }),
      );
    });

    it('requires first and last name', async () => {
      prisma.user.findUnique.mockResolvedValue(pending as never);

      await expect(service.completeProfile('user-1', { firstName: ' ', lastName: 'X' })).rejects.toThrow(
        'First name and last name are required',
      );
      await expect(service.completeProfile('user-1', { firstName: 'X' } as never)).rejects.toThrow(BadRequestException);
    });

    it('404s on an unknown department', async () => {
      prisma.user.findUnique.mockResolvedValue(pending as never);
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.completeProfile('user-1', { firstName: 'Pat', lastName: 'P', departmentId: 'nope' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('is only for accounts awaiting approval', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: null } as never);

      await expect(service.completeProfile('user-1', { firstName: 'Pat', lastName: 'P' })).rejects.toThrow(
        'Only an account awaiting approval can submit an access request',
      );
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      prisma.role.upsert.mockResolvedValue({ id: 'role-inv', name: 'inventory' } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);
    });

    it('activates a pending user with the chosen role and records the reviewer', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', departmentId: 'dept-0', role: null } as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'dept-1' } as never);

      await service.approve('user-1', { roleName: 'inventory', departmentId: 'dept-1' }, 'admin-1');

      expect(prisma.role.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'inventory' } }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'ACTIVE',
            isActive: true,
            roleId: 'role-inv',
            departmentId: 'dept-1',
            reviewedById: 'admin-1',
            reviewedAt: expect.any(Date),
            rejectionReason: null,
          },
        }),
      );
    });

    it('keeps the department the user asked for when the admin does not change it', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', departmentId: 'dept-0', role: null } as never);

      await service.approve('user-1', { roleName: 'inventory' }, 'admin-1');

      expect(prisma.department.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ departmentId: 'dept-0' }) }),
      );
    });

    it('can reverse an earlier rejection', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'REJECTED', departmentId: null, role: null } as never);

      await expect(service.approve('user-1', { roleName: 'staff' }, 'admin-1')).resolves.toBeDefined();
    });

    it('refuses users who are already active or disabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: null } as never);

      await expect(service.approve('user-1', { roleName: 'staff' }, 'admin-1')).rejects.toThrow(
        'A active user cannot be approved',
      );
    });

    it('rejects a role that is not assignable', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', role: null } as never);

      await expect(service.approve('user-1', { roleName: 'superuser' }, 'admin-1')).rejects.toThrow(
        /Role must be one of/,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('404s on an unknown department', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', role: null } as never);
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.approve('user-1', { roleName: 'staff', departmentId: 'nope' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('marks a pending request rejected with the reason', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', role: null } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.reject('user-1', { reason: ' Not one of ours ' }, 'admin-1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'REJECTED',
            isActive: false,
            reviewedById: 'admin-1',
            reviewedAt: expect.any(Date),
            rejectionReason: 'Not one of ours',
          },
        }),
      );
    });

    it('stores no reason as null', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', role: null } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.reject('user-1', {}, 'admin-1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) }),
      );
    });

    it('only works on pending requests', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: null } as never);

      await expect(service.reject('user-1', {}, 'admin-1')).rejects.toThrow('Only a pending request can be rejected');
    });
  });

  describe('disable', () => {
    const active = (roleName: string) => ({ id: 'user-1', status: 'ACTIVE', role: { name: roleName } });

    it('disables an active user', async () => {
      prisma.user.findUnique.mockResolvedValue(active('hse') as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.disable('user-1', 'admin-1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'DISABLED', isActive: false, reviewedById: 'admin-1', reviewedAt: expect.any(Date) },
        }),
      );
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('only works on active users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', role: null } as never);

      await expect(service.disable('user-1', 'admin-1')).rejects.toThrow('Only an active user can be disabled');
    });

    it('will not let admins disable themselves', async () => {
      prisma.user.findUnique.mockResolvedValue(active('admin') as never);

      await expect(service.disable('user-1', 'user-1')).rejects.toThrow('You cannot disable your own account');
    });

    it('protects the last active admin', async () => {
      prisma.user.findUnique.mockResolvedValue(active('admin') as never);
      prisma.user.count.mockResolvedValue(0);

      await expect(service.disable('user-1', 'admin-2')).rejects.toThrow(/last active admin/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lets an admin go when another active admin remains', async () => {
      prisma.user.findUnique.mockResolvedValue(active('admin') as never);
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await expect(service.disable('user-1', 'admin-2')).resolves.toBeDefined();
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { id: { not: 'user-1' }, status: 'ACTIVE', role: { name: 'admin' } },
      });
    });
  });

  describe('enable', () => {
    it('re-activates a disabled user who still has a role', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'DISABLED', roleId: 'role-1', role: null } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.enable('user-1', 'admin-1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ACTIVE', isActive: true, reviewedById: 'admin-1', reviewedAt: expect.any(Date) },
        }),
      );
    });

    it('only works on disabled users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: null } as never);

      await expect(service.enable('user-1', 'admin-1')).rejects.toThrow('Only a disabled user can be re-enabled');
    });

    it('needs a role to enable', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'DISABLED', roleId: null, role: null } as never);

      await expect(service.enable('user-1', 'admin-1')).rejects.toThrow('Assign a role before re-enabling this user');
    });
  });

  describe('update', () => {
    const existing = { id: 'user-1', status: 'ACTIVE', role: { name: 'hse' } };

    beforeEach(() => {
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);
    });

    it('updates names, phone, department and role together', async () => {
      prisma.user.findUnique.mockResolvedValue(existing as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'dept-1' } as never);
      prisma.role.upsert.mockResolvedValue({ id: 'role-inv', name: 'inventory' } as never);

      await service.update('user-1', {
        firstName: ' Ann ',
        lastName: ' Store ',
        phone: ' 555 ',
        departmentId: 'dept-1',
        roleName: 'inventory',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { firstName: 'Ann', lastName: 'Store', phone: '555', departmentId: 'dept-1', roleId: 'role-inv' },
        }),
      );
    });

    it('does nothing to fields that were not sent', async () => {
      prisma.user.findUnique.mockResolvedValue(existing as never);

      await service.update('user-1', {});

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
    });

    it('clears a phone number sent as blank', async () => {
      prisma.user.findUnique.mockResolvedValue(existing as never);

      await service.update('user-1', { phone: ' ' });

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { phone: null } }));
    });

    it('refuses blank names', async () => {
      prisma.user.findUnique.mockResolvedValue(existing as never);

      await expect(service.update('user-1', { firstName: ' ' })).rejects.toThrow('First name cannot be blank');
      await expect(service.update('user-1', { lastName: '' })).rejects.toThrow('Last name cannot be blank');
    });

    it('404s on an unknown department', async () => {
      prisma.user.findUnique.mockResolvedValue(existing as never);
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.update('user-1', { departmentId: 'nope' })).rejects.toThrow(NotFoundException);
    });

    it('protects the last active admin from being demoted', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: { name: 'admin' } } as never);
      prisma.user.count.mockResolvedValue(0);

      await expect(service.update('user-1', { roleName: 'viewer' })).rejects.toThrow(/last active admin/);
    });

    it('lets an admin keep the admin role without a last-admin check', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: { name: 'admin' } } as never);
      prisma.role.upsert.mockResolvedValue({ id: 'role-admin', name: 'admin' } as never);

      await service.update('user-1', { roleName: 'admin' });

      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('does not count a disabled admin as the last admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'DISABLED', role: { name: 'admin' } } as never);
      prisma.role.upsert.mockResolvedValue({ id: 'role-viewer', name: 'viewer' } as never);

      await service.update('user-1', { roleName: 'viewer' });

      expect(prisma.user.count).not.toHaveBeenCalled();
    });
  });

  describe('emails', () => {
    it('tells admins once, when a sign-up request first arrives, and includes the department', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', requestedAt: null, role: null } as never);
      prisma.department.findUnique.mockResolvedValue({ id: 'dept-1' } as never);
      const updated = { id: 'user-1', email: 'pat@acme.test', department: { name: 'Stores' } };
      prisma.user.update.mockResolvedValue(updated as never);

      await service.completeProfile('user-1', { firstName: 'Pat', lastName: 'P', departmentId: 'dept-1' });

      expect(notifier.accessRequested).toHaveBeenCalledWith(updated, 'Stores');
    });

    it('names no department when there is none, and does not repeat the email on an edit', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', requestedAt: null, role: null } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1', department: null } as never);
      await service.completeProfile('user-1', { firstName: 'Pat', lastName: 'P' });
      expect(notifier.accessRequested).toHaveBeenCalledWith(expect.anything(), null);

      notifier.accessRequested.mockClear();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', requestedAt: new Date(), role: null } as never);
      await service.completeProfile('user-1', { firstName: 'Pat', lastName: 'Edited' });
      expect(notifier.accessRequested).not.toHaveBeenCalled();
    });

    it('tells the person when they are approved, with the role they were given', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', departmentId: null, role: null } as never);
      prisma.role.upsert.mockResolvedValue({ id: 'role-inv', name: 'inventory' } as never);
      const approved = { id: 'user-1', role: { name: 'inventory' } };
      prisma.user.update.mockResolvedValue(approved as never);

      await service.approve('user-1', { roleName: 'inventory' }, 'admin-1');

      expect(notifier.accessApproved).toHaveBeenCalledWith(approved, 'inventory');
    });

    it('falls back to the requested role name if the saved user has no role loaded', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', departmentId: null, role: null } as never);
      prisma.role.upsert.mockResolvedValue({ id: 'role-inv', name: 'inventory' } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1', role: null } as never);

      await service.approve('user-1', { roleName: 'staff' }, 'admin-1');

      expect(notifier.accessApproved).toHaveBeenCalledWith(expect.anything(), 'staff');
    });

    it('tells the person when they are rejected, with the reason', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'PENDING', role: null } as never);
      const rejected = { id: 'user-1', rejectionReason: 'Not a contractor of ours' };
      prisma.user.update.mockResolvedValue(rejected as never);

      await service.reject('user-1', { reason: 'Not a contractor of ours' }, 'admin-1');

      expect(notifier.accessRejected).toHaveBeenCalledWith(rejected, 'Not a contractor of ours');
    });

    it('sends nothing when the action is refused', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: null } as never);

      await expect(service.reject('user-1', {}, 'admin-1')).rejects.toThrow();
      await expect(service.approve('user-1', { roleName: 'staff' }, 'admin-1')).rejects.toThrow();

      expect(notifier.accessRejected).not.toHaveBeenCalled();
      expect(notifier.accessApproved).not.toHaveBeenCalled();
    });
  });
});
