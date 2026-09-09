import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { AttendanceService } from './attendance.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' });
}

describe('AttendanceService', () => {
  let prisma: MockPrisma;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AttendanceService(prisma);
  });

  describe('clockIn', () => {
    it('404s when the employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.clockIn('missing')).rejects.toThrow(NotFoundException);
    });

    it('creates a PRESENT record for an employee with no shift assigned', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T09:05:00.000Z'));
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', shift: null } as never);
      prisma.attendanceRecord.findUnique.mockResolvedValue(null);
      prisma.attendanceRecord.create.mockResolvedValue({ id: 'att-1', status: 'PRESENT' } as never);

      await service.clockIn('emp-1');

      expect(prisma.attendanceRecord.create).toHaveBeenCalledWith({
        data: {
          employeeId: 'emp-1',
          date: new Date('2026-06-15T00:00:00.000Z'),
          clockIn: new Date('2026-06-15T09:05:00.000Z'),
          status: 'PRESENT',
        },
      });
      jest.useRealTimers();
    });

    it('marks PRESENT when clocking in within the grace period of the shift start', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T09:05:00.000Z'));
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        shift: { startTime: '09:00' },
      } as never);
      prisma.attendanceRecord.findUnique.mockResolvedValue(null);
      prisma.attendanceRecord.create.mockResolvedValue({ id: 'att-1' } as never);

      await service.clockIn('emp-1');

      expect(prisma.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PRESENT' }) }),
      );
      jest.useRealTimers();
    });

    it('marks LATE when clocking in past the grace period of the shift start', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T09:15:00.000Z'));
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        shift: { startTime: '09:00' },
      } as never);
      prisma.attendanceRecord.findUnique.mockResolvedValue(null);
      prisma.attendanceRecord.create.mockResolvedValue({ id: 'att-1' } as never);

      await service.clockIn('emp-1');

      expect(prisma.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'LATE' }) }),
      );
      jest.useRealTimers();
    });

    it('rejects clocking in twice on the same day', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', shift: null } as never);
      prisma.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1', clockIn: new Date() } as never);

      await expect(service.clockIn('emp-1')).rejects.toThrow(ConflictException);
    });

    it('updates an existing clock-in-less record in place (e.g. one HR pre-created for today)', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', shift: null } as never);
      prisma.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1', clockIn: null } as never);
      prisma.attendanceRecord.update.mockResolvedValue({ id: 'att-1' } as never);

      await service.clockIn('emp-1');

      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'att-1' } }),
      );
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('clockOut', () => {
    it('rejects when there is no record for today', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(null);

      await expect(service.clockOut('emp-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects when the employee never clocked in today', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1', clockIn: null } as never);

      await expect(service.clockOut('emp-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects clocking out twice', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({
        id: 'att-1',
        clockIn: new Date(),
        clockOut: new Date(),
      } as never);

      await expect(service.clockOut('emp-1')).rejects.toThrow(ConflictException);
    });

    it('sets clockOut on the existing record', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({
        id: 'att-1',
        clockIn: new Date(),
        clockOut: null,
      } as never);
      prisma.attendanceRecord.update.mockResolvedValue({ id: 'att-1' } as never);

      await service.clockOut('emp-1');

      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'att-1' } }),
      );
    });
  });

  describe('findForEmployee', () => {
    it('scopes to the employee and forwards a date range', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([] as never);

      await service.findForEmployee('emp-1', { from: '2026-06-01', to: '2026-06-30' });

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employeeId: 'emp-1',
            date: { gte: new Date('2026-06-01T00:00:00.000Z'), lte: new Date('2026-06-30T00:00:00.000Z') },
          },
        }),
      );
    });

    it('leaves the date range open-ended when no from/to is given', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([] as never);

      await service.findForEmployee('emp-1');

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-1', date: { gte: undefined, lte: undefined } } }),
      );
    });
  });

  describe('findAll', () => {
    it('forwards every filter and includes the employee', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([] as never);

      await service.findAll({ employeeId: 'emp-1', status: 'LATE' });

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-1', status: 'LATE' }),
          include: { employee: true },
        }),
      );
    });

    it('defaults to no filters when called with no arguments', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([] as never);

      await service.findAll();

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ employeeId: undefined, status: undefined }) }),
      );
    });

    it('forwards a from/to date range', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue([] as never);

      await service.findAll({ from: '2026-06-01', to: '2026-06-30' });

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: new Date('2026-06-01T00:00:00.000Z'), lte: new Date('2026-06-30T00:00:00.000Z') },
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('creates a manual record', async () => {
      prisma.attendanceRecord.create.mockResolvedValue({ id: 'att-1' } as never);

      await service.create({ employeeId: 'emp-1', date: '2026-06-15', status: 'ON_LEAVE' });

      expect(prisma.attendanceRecord.create).toHaveBeenCalledWith({
        data: {
          employeeId: 'emp-1',
          date: new Date('2026-06-15T00:00:00.000Z'),
          status: 'ON_LEAVE',
          clockIn: undefined,
          clockOut: undefined,
          notes: undefined,
        },
      });
    });

    it('accepts explicit clockIn/clockOut for a backdated record', async () => {
      prisma.attendanceRecord.create.mockResolvedValue({ id: 'att-1' } as never);

      await service.create({
        employeeId: 'emp-1',
        date: '2026-06-15',
        status: 'PRESENT',
        clockIn: '2026-06-15T09:00:00.000Z',
        clockOut: '2026-06-15T17:00:00.000Z',
      });

      expect(prisma.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clockIn: new Date('2026-06-15T09:00:00.000Z'),
            clockOut: new Date('2026-06-15T17:00:00.000Z'),
          }),
        }),
      );
    });

    it('409s when a record for that employee/day already exists', async () => {
      prisma.attendanceRecord.create.mockRejectedValue(p2002());

      await expect(
        service.create({ employeeId: 'emp-1', date: '2026-06-15', status: 'ON_LEAVE' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated errors', async () => {
      prisma.attendanceRecord.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({ employeeId: 'emp-1', date: '2026-06-15', status: 'ON_LEAVE' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('update', () => {
    it('404s when the record does not exist', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { status: 'ABSENT' })).rejects.toThrow(NotFoundException);
    });

    it('updates the given fields', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1' } as never);
      prisma.attendanceRecord.update.mockResolvedValue({ id: 'att-1', status: 'ABSENT' } as never);

      await service.update('att-1', { status: 'ABSENT', notes: 'Called in sick' });

      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { status: 'ABSENT', clockIn: undefined, clockOut: undefined, notes: 'Called in sick' },
      });
    });

    it('corrects clockIn/clockOut when given', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({ id: 'att-1' } as never);
      prisma.attendanceRecord.update.mockResolvedValue({ id: 'att-1' } as never);

      await service.update('att-1', {
        clockIn: '2026-06-15T09:10:00.000Z',
        clockOut: '2026-06-15T17:10:00.000Z',
      });

      expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clockIn: new Date('2026-06-15T09:10:00.000Z'),
            clockOut: new Date('2026-06-15T17:10:00.000Z'),
          }),
        }),
      );
    });
  });
});
