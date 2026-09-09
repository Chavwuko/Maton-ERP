import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { EmployeesService } from './employees.service';

describe('AttendanceController', () => {
  let attendanceService: jest.Mocked<AttendanceService>;
  let employeesService: jest.Mocked<EmployeesService>;
  let controller: AttendanceController;

  beforeEach(() => {
    attendanceService = {
      clockIn: jest.fn(),
      clockOut: jest.fn(),
      findForEmployee: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<AttendanceService>;
    employeesService = {
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<EmployeesService>;
    controller = new AttendanceController(attendanceService, employeesService);
  });

  const req = (userId: string) => ({ user: { id: userId } }) as never;

  it('clockIn resolves the caller\'s own employee record then clocks in', async () => {
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);

    await controller.clockIn(req('user-1'));

    expect(employeesService.findByUserId).toHaveBeenCalledWith('user-1');
    expect(attendanceService.clockIn).toHaveBeenCalledWith('emp-1');
  });

  it('clockOut resolves the caller\'s own employee record then clocks out', async () => {
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);

    await controller.clockOut(req('user-1'));

    expect(attendanceService.clockOut).toHaveBeenCalledWith('emp-1');
  });

  it('findMine forwards the date range for the caller\'s own employee record', async () => {
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);

    await controller.findMine(req('user-1'), '2026-06-01', '2026-06-30');

    expect(attendanceService.findForEmployee).toHaveBeenCalledWith('emp-1', {
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('findAll forwards every filter', () => {
    controller.findAll('emp-1', '2026-06-01', '2026-06-30', 'LATE' as never);

    expect(attendanceService.findAll).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      from: '2026-06-01',
      to: '2026-06-30',
      status: 'LATE',
    });
  });

  it('create delegates the dto', () => {
    const dto = { employeeId: 'emp-1', date: '2026-06-15', status: 'ON_LEAVE' as never };
    controller.create(dto);
    expect(attendanceService.create).toHaveBeenCalledWith(dto);
  });

  it('update delegates the id and dto', () => {
    controller.update('att-1', { status: 'ABSENT' as never });
    expect(attendanceService.update).toHaveBeenCalledWith('att-1', { status: 'ABSENT' });
  });
});
