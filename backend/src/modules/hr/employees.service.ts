import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeGrade, EmploymentStatus, EmploymentType, Gender, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmploymentStatusDto } from './dto/update-employment-status.dto';

interface Bucket {
  label: string;
  count: number;
}

const AGE_RANGES = ['Under 25', '25-34', '35-44', '45-54', '55+', 'Unknown'] as const;

function ageRangeOf(dateOfBirth: Date | null, now: Date): (typeof AGE_RANGES)[number] {
  if (!dateOfBirth) return 'Unknown';
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());
  if (!hadBirthdayThisYear) age--;

  if (age < 25) return 'Under 25';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

function isInRange(date: Date | null, start: Date, end: Date): boolean {
  return !!date && date >= start && date < end;
}

// Seeds every known label at 0 so a fixed-category chart (gender,
// employment type, grade, age range) never silently drops a category just
// because no employee currently falls into it.
function tally<T>(items: T[], keyFn: (item: T) => string, knownLabels: readonly string[] = []): Bucket[] {
  const counts = new Map<string, number>(knownLabels.map((label) => [label, 0]));
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

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
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          employmentType: dto.employmentType,
          grade: dto.grade,
          branch: dto.branch,
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
      data: {
        employmentStatus: dto.employmentStatus,
        exitDate: dto.employmentStatus === 'TERMINATED' ? new Date(dto.exitDate ?? Date.now()) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: {
        jobTitle: dto.jobTitle,
        managerId: dto.managerId,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        employmentType: dto.employmentType,
        grade: dto.grade,
        branch: dto.branch,
      },
    });
  }

  async getDashboard(filters: { organizationId?: string }) {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId: filters.organizationId },
      include: { user: { include: { department: true } } },
    });

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    const quarterEnd = new Date(now.getFullYear(), quarterStartMonth + 3, 1);

    return {
      totalEmployees: employees.length,
      newHiresThisYear: employees.filter((e) => isInRange(e.hireDate, yearStart, yearEnd)).length,
      exitsThisYear: employees.filter((e) => isInRange(e.exitDate, yearStart, yearEnd)).length,
      relievingThisQuarter: employees.filter((e) => isInRange(e.exitDate, quarterStart, quarterEnd)).length,
      joiningThisQuarter: employees.filter((e) => isInRange(e.hireDate, quarterStart, quarterEnd)).length,
      byAgeRange: tally(employees, (e) => ageRangeOf(e.dateOfBirth, now), AGE_RANGES),
      byGender: tally(employees, (e) => e.gender ?? 'Unknown', [...Object.values(Gender), 'Unknown']),
      byEmploymentType: tally(employees, (e) => e.employmentType ?? 'Unknown', [
        ...Object.values(EmploymentType),
        'Unknown',
      ]),
      byGrade: tally(employees, (e) => e.grade ?? 'Unknown', [...Object.values(EmployeeGrade), 'Unknown']),
      byBranch: tally(employees, (e) => e.branch ?? 'Unknown'),
      byDesignation: tally(employees, (e) => e.jobTitle),
      byDepartment: tally(employees, (e) => e.user.department?.name ?? 'Unassigned'),
    };
  }
}
