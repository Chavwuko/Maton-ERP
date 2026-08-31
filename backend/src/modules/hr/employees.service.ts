import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmploymentStatusDto } from './dto/update-employment-status.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { organizationId?: string; employmentStatus?: EmploymentStatus; managerId?: string }) {
    return this.prisma.employee.findMany({
      where: {
        organizationId: filters.organizationId,
        employmentStatus: filters.employmentStatus,
        managerId: filters.managerId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { manager: true, directReports: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    return employee;
  }

  // Resolves the calling user's own HR record for every /employees/me
  // self-service route. Not every authenticated User is an onboarded
  // employee, so this 404s rather than returning null.
  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) {
      throw new NotFoundException('No employee record found for the current user');
    }
    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    try {
      return await this.prisma.employee.create({
        data: {
          organizationId: dto.organizationId,
          userId: dto.userId,
          employeeNumber: dto.employeeNumber,
          jobTitle: dto.jobTitle,
          hireDate: new Date(dto.hireDate),
          managerId: dto.managerId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (target.includes('userId')) {
          throw new ConflictException('This user already has an employee record');
        }
        throw new ConflictException(
          `Employee number "${dto.employeeNumber}" already exists in this organization`,
        );
      }
      throw err;
    }
  }

  async updateEmploymentStatus(id: string, dto: UpdateEmploymentStatusDto) {
    const employee = await this.findOne(id);
    if (employee.employmentStatus === 'TERMINATED') {
      throw new BadRequestException('Cannot change the status of a terminated employee');
    }
    return this.prisma.employee.update({
      where: { id },
      data: { employmentStatus: dto.employmentStatus },
    });
  }
}
