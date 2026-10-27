import { MaintenanceSchedulesController } from './maintenance-schedules.controller';
import type { MaintenanceSchedulesService } from './maintenance-schedules.service';

describe('MaintenanceSchedulesController', () => {
  let service: jest.Mocked<MaintenanceSchedulesService>;
  let controller: MaintenanceSchedulesController;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      generateDue: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<MaintenanceSchedulesService>;
    controller = new MaintenanceSchedulesController(service);
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'a1', 'true', 'OVERDUE');

    expect(service.findAll).toHaveBeenCalledWith({ organizationId: 'org-1', assetId: 'a1', active: 'true', dueStatus: 'OVERDUE' });
  });

  it('findOne, update and remove forward the id', () => {
    controller.findOne('s1');
    controller.update('s1', { title: 'New' });
    controller.remove('s1');

    expect(service.findOne).toHaveBeenCalledWith('s1');
    expect(service.update).toHaveBeenCalledWith('s1', { title: 'New' });
    expect(service.remove).toHaveBeenCalledWith('s1');
  });

  it('create acts as the signed-in user', () => {
    const dto = { assetId: 'a1', title: 'Grease', intervalValue: 1, intervalUnit: 'MONTHS', firstDueDate: '2026-12-01' } as never;

    controller.create(dto, req);

    expect(service.create).toHaveBeenCalledWith(dto, { id: 'user-1' });
  });

  it('generate runs the due check for everything', () => {
    controller.generate();

    expect(service.generateDue).toHaveBeenCalledWith();
  });
});
