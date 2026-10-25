import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailNotifier } from '../mail/email-notifier';
import { ApproveUserDto } from './dto/approve-user.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ASSIGNABLE_ROLES } from './user-roles';

const USER_STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'DISABLED', 'REJECTED'];
const USER_INCLUDE = { role: true, department: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: EmailNotifier,
  ) {}

  findAll(filters: { role?: string | string[]; isActive?: boolean; status?: UserStatus }) {
    if (filters.status && !USER_STATUSES.includes(filters.status)) {
      throw new BadRequestException(`status must be one of: ${USER_STATUSES.join(', ')}`);
    }
    const roles = filters.role ? (Array.isArray(filters.role) ? filters.role : [filters.role]) : undefined;

    return this.prisma.user.findMany({
      where: {
        role: roles ? { name: { in: roles } } : undefined,
        isActive: filters.isActive,
        status: filters.status,
      },
      include: USER_INCLUDE,
      orderBy: { email: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  // A signed-up user asking to be let in. Stays PENDING until an admin acts;
  // submitting again just updates the details while they wait.
  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const user = await this.findOne(userId);
    if (user.status !== 'PENDING') {
      throw new BadRequestException('Only an account awaiting approval can submit an access request');
    }

    const firstName = dto.firstName?.trim();
    const lastName = dto.lastName?.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException('First name and last name are required');
    }
    if (dto.departmentId) {
      await this.assertDepartmentExists(dto.departmentId);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        phone: dto.phone?.trim() || null,
        departmentId: dto.departmentId || null,
        requestedAt: new Date(),
      },
      include: USER_INCLUDE,
    });
    // Admins are told once, when the request first arrives, not on every edit.
    if (!user.requestedAt) {
      void this.notifier.accessRequested(updated, updated.department?.name ?? null);
    }
    return updated;
  }

  // TODO(roadmap): email the person once approved (role included) — needs an
  // email service, which the backend does not have yet. See README Roadmap.
  async approve(id: string, dto: ApproveUserDto, reviewerId: string) {
    const user = await this.findOne(id);
    if (user.status !== 'PENDING' && user.status !== 'REJECTED') {
      throw new BadRequestException(`A ${user.status.toLowerCase()} user cannot be approved`);
    }
    const roleId = await this.resolveRoleId(dto.roleName);
    if (dto.departmentId) {
      await this.assertDepartmentExists(dto.departmentId);
    }

    const approved = await this.prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        isActive: true,
        roleId,
        departmentId: dto.departmentId ?? user.departmentId,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
      include: USER_INCLUDE,
    });
    void this.notifier.accessApproved(approved, approved.role?.name ?? dto.roleName);
    return approved;
  }

  // TODO(roadmap): email the person the rejection reason. See README Roadmap.
  async reject(id: string, dto: RejectUserDto, reviewerId: string) {
    const user = await this.findOne(id);
    if (user.status !== 'PENDING') {
      throw new BadRequestException('Only a pending request can be rejected');
    }

    const rejected = await this.prisma.user.update({
      where: { id },
      data: {
        status: 'REJECTED',
        isActive: false,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: dto.reason?.trim() || null,
      },
      include: USER_INCLUDE,
    });
    void this.notifier.accessRejected(rejected, rejected.rejectionReason);
    return rejected;
  }

  async disable(id: string, reviewerId: string) {
    const user = await this.findOne(id);
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Only an active user can be disabled');
    }
    if (id === reviewerId) {
      throw new BadRequestException('You cannot disable your own account');
    }
    await this.assertNotLastAdmin(user);

    return this.prisma.user.update({
      where: { id },
      data: { status: 'DISABLED', isActive: false, reviewedById: reviewerId, reviewedAt: new Date() },
      include: USER_INCLUDE,
    });
  }

  async enable(id: string, reviewerId: string) {
    const user = await this.findOne(id);
    if (user.status !== 'DISABLED') {
      throw new BadRequestException('Only a disabled user can be re-enabled');
    }
    if (!user.roleId) {
      throw new BadRequestException('Assign a role before re-enabling this user');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', isActive: true, reviewedById: reviewerId, reviewedAt: new Date() },
      include: USER_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    const data: Prisma.UserUncheckedUpdateInput = {};

    if (dto.firstName !== undefined) {
      if (!dto.firstName.trim()) throw new BadRequestException('First name cannot be blank');
      data.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      if (!dto.lastName.trim()) throw new BadRequestException('Last name cannot be blank');
      data.lastName = dto.lastName.trim();
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }
    if (dto.departmentId !== undefined) {
      await this.assertDepartmentExists(dto.departmentId);
      data.departmentId = dto.departmentId;
    }
    if (dto.roleName !== undefined) {
      if (user.role?.name === 'admin' && dto.roleName !== 'admin') {
        await this.assertNotLastAdmin(user);
      }
      data.roleId = await this.resolveRoleId(dto.roleName);
    }

    return this.prisma.user.update({ where: { id }, data, include: USER_INCLUDE });
  }

  private async resolveRoleId(roleName: string): Promise<string> {
    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(roleName)) {
      throw new BadRequestException(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
    }
    // Upsert so a role added to the list above works before the next seed run.
    const role = await this.prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    return role.id;
  }

  private async assertDepartmentExists(departmentId: string) {
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
  }

  // Locking every admin out would leave nobody able to approve anyone.
  private async assertNotLastAdmin(user: { id: string; status: UserStatus; role: { name: string } | null }) {
    if (user.role?.name !== 'admin' || user.status !== 'ACTIVE') {
      return;
    }
    const otherAdmins = await this.prisma.user.count({
      where: { id: { not: user.id }, status: 'ACTIVE', role: { name: 'admin' } },
    });
    if (otherAdmins === 0) {
      throw new BadRequestException('This is the last active admin; make another user an admin first');
    }
  }
}
