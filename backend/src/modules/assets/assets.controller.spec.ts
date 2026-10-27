import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

describe('AssetsController', () => {
  let service: jest.Mocked<AssetsService>;
  let controller: AssetsController;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findMine: jest.fn(),
      findOne: jest.fn(),
      assignments: jest.fn(),
      history: jest.fn(),
      serviceHistory: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      checkOut: jest.fn(),
      checkIn: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;
    controller = new AssetsController(service);
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'ACTIVE', 'proj-1', 'dept-1', 'FAIR', 'user-9', 'pump');

    expect(service.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: 'ACTIVE',
      projectId: 'proj-1',
      departmentId: 'dept-1',
      condition: 'FAIR',
      assignedToId: 'user-9',
      search: 'pump',
    });
  });

  it('findMine asks for the signed-in user', () => {
    controller.findMine(req);

    expect(service.findMine).toHaveBeenCalledWith('user-1');
  });

  it('findOne, assignments, service history and history forward the id', () => {
    controller.findOne('a1');
    controller.assignments('a1');
    controller.serviceHistory('a1');
    controller.history('a1');

    expect(service.serviceHistory).toHaveBeenCalledWith('a1');
    expect(service.findOne).toHaveBeenCalledWith('a1');
    expect(service.assignments).toHaveBeenCalledWith('a1');
    expect(service.history).toHaveBeenCalledWith('a1');
  });

  it('create and update forward the dto', () => {
    const dto = { organizationId: 'org-1', assetTag: 'PUMP-1', name: 'Pump', category: 'x' };
    controller.create(dto);
    controller.update('a1', { name: 'New' });

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.update).toHaveBeenCalledWith('a1', { name: 'New' });
  });

  it('check-out and check-in act as the signed-in user', () => {
    controller.checkOut('a1', { assigneeId: 'u1' }, req);
    controller.checkIn('a1', { condition: 'GOOD' }, req);

    expect(service.checkOut).toHaveBeenCalledWith('a1', { assigneeId: 'u1' }, { id: 'user-1' });
    expect(service.checkIn).toHaveBeenCalledWith('a1', { condition: 'GOOD' }, { id: 'user-1' });
  });
});
