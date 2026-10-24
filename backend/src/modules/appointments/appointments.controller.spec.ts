import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsController', () => {
  let service: jest.Mocked<AppointmentsService>;
  let controller: AppointmentsController;
  const req = { user: { id: 'user-1', roleName: 'staff' } } as never;

  beforeEach(() => {
    service = {
      getSchedule: jest.fn(),
      updateSchedule: jest.fn(),
      slots: jest.fn(),
      findMine: jest.fn(),
      findAll: jest.fn(),
      book: jest.fn(),
      cancel: jest.fn(),
      review: jest.fn(),
    } as unknown as jest.Mocked<AppointmentsService>;
    controller = new AppointmentsController(service);
  });

  it('getSchedule and updateSchedule delegate', () => {
    controller.getSchedule();
    controller.updateSchedule({ slotMinutes: 60 });

    expect(service.getSchedule).toHaveBeenCalled();
    expect(service.updateSchedule).toHaveBeenCalledWith({ slotMinutes: 60 });
  });

  it('slots passes the date', () => {
    controller.slots('2026-10-26');

    expect(service.slots).toHaveBeenCalledWith('2026-10-26');
  });

  it('findMine uses the signed-in user', () => {
    controller.findMine(req);

    expect(service.findMine).toHaveBeenCalledWith('user-1');
  });

  it('findAll passes the filters', () => {
    controller.findAll('PENDING', '2026-10-01', '2026-10-31');

    expect(service.findAll).toHaveBeenCalledWith({ status: 'PENDING', from: '2026-10-01', to: '2026-10-31' });
  });

  it('book, cancel and review act as the signed-in user', () => {
    const dto = { date: '2026-10-26', time: '09:00', subject: 'Gloves' };
    controller.book(dto, req);
    controller.cancel('appt-1', req);
    controller.review('appt-1', { decision: 'APPROVED' }, req);

    expect(service.book).toHaveBeenCalledWith(dto, (req as { user: unknown }).user);
    expect(service.cancel).toHaveBeenCalledWith('appt-1', (req as { user: unknown }).user);
    expect(service.review).toHaveBeenCalledWith('appt-1', { decision: 'APPROVED' }, (req as { user: unknown }).user);
  });
});
