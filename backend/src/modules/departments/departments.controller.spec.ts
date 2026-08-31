import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

describe('DepartmentsController', () => {
  let service: jest.Mocked<DepartmentsService>;
  let controller: DepartmentsController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<DepartmentsService>;
    controller = new DepartmentsController(service);
  });

  it('findAll delegates the organizationId filter', () => {
    controller.findAll('org-1');
    expect(service.findAll).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('findOne delegates the id', () => {
    controller.findOne('dept-1');
    expect(service.findOne).toHaveBeenCalledWith('dept-1');
  });

  it('create delegates the dto', () => {
    const dto = { organizationId: 'org-1', code: 'FIN', name: 'Finance' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update delegates the id and dto', () => {
    const dto = { name: 'Finance & Treasury' };
    controller.update('dept-1', dto);
    expect(service.update).toHaveBeenCalledWith('dept-1', dto);
  });
});
