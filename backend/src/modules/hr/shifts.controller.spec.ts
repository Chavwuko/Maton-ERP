import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

describe('ShiftsController', () => {
  let service: jest.Mocked<ShiftsService>;
  let controller: ShiftsController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<ShiftsService>;
    controller = new ShiftsController(service);
  });

  it('findAll forwards the organizationId filter', () => {
    controller.findAll('org-1');
    expect(service.findAll).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('findOne delegates the id', () => {
    controller.findOne('shift-1');
    expect(service.findOne).toHaveBeenCalledWith('shift-1');
  });

  it('create delegates the dto', () => {
    const dto = { organizationId: 'org-1', name: 'Morning', startTime: '09:00', endTime: '17:00' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update delegates the id and dto', () => {
    controller.update('shift-1', { name: 'Evening' });
    expect(service.update).toHaveBeenCalledWith('shift-1', { name: 'Evening' });
  });
});
