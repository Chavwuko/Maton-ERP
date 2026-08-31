import { mockRequest } from '../../../test/utils/mock-request';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceController', () => {
  let service: jest.Mocked<MaintenanceService>;
  let controller: MaintenanceController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      assign: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<MaintenanceService>;
    controller = new MaintenanceController(service);
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'a1', 'OPEN' as never, 'CORRECTIVE' as never, 'HIGH' as never);
    expect(service.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      assetId: 'a1',
      status: 'OPEN',
      type: 'CORRECTIVE',
      priority: 'HIGH',
    });
  });

  it('findOne forwards the id', () => {
    controller.findOne('wo-1');
    expect(service.findOne).toHaveBeenCalledWith('wo-1');
  });

  it('create forwards the dto and req.user.id as requestedById', () => {
    const dto = { organizationId: 'org-1', assetId: 'a1', title: 'Fix it' };
    const req = mockRequest({ id: 'reporter-1' });

    controller.create(dto, req);

    expect(service.create).toHaveBeenCalledWith(dto, 'reporter-1');
  });

  it('assign forwards the id and dto', () => {
    controller.assign('wo-1', { assignedToId: 'u1' });
    expect(service.assign).toHaveBeenCalledWith('wo-1', { assignedToId: 'u1' });
  });

  it('updateStatus forwards the id and dto', () => {
    controller.updateStatus('wo-1', { status: 'IN_PROGRESS' as never });
    expect(service.updateStatus).toHaveBeenCalledWith('wo-1', { status: 'IN_PROGRESS' });
  });
});
