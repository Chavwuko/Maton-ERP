import { mockRequest } from '../../../test/utils/mock-request';
import { HseController } from './hse.controller';
import { HseService } from './hse.service';

describe('HseController', () => {
  let service: jest.Mocked<HseService>;
  let controller: HseController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      listCorrectiveActions: jest.fn(),
      createCorrectiveAction: jest.fn(),
      updateCorrectiveAction: jest.fn(),
    } as unknown as jest.Mocked<HseService>;
    controller = new HseController(service);
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'REPORTED' as never, 'INJURY' as never, 'HIGH' as never, 'proj-1', 'a1');
    expect(service.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: 'REPORTED',
      type: 'INJURY',
      severity: 'HIGH',
      projectId: 'proj-1',
      assetId: 'a1',
    });
  });

  it('findOne forwards the id', () => {
    controller.findOne('inc-1');
    expect(service.findOne).toHaveBeenCalledWith('inc-1');
  });

  it('create forwards the dto and req.user.id as reportedById', () => {
    const dto = { organizationId: 'org-1', title: 'x', type: 'NEAR_MISS' as const, severity: 'LOW' as const, occurredAt: '2026-01-01T00:00:00.000Z' };
    const req = mockRequest({ id: 'reporter-1' });

    controller.create(dto, req);

    expect(service.create).toHaveBeenCalledWith(dto, 'reporter-1');
  });

  it('updateStatus forwards the id and dto', () => {
    controller.updateStatus('inc-1', { status: 'CLOSED' as never });
    expect(service.updateStatus).toHaveBeenCalledWith('inc-1', { status: 'CLOSED' });
  });

  it('listCorrectiveActions forwards the incident id', () => {
    controller.listCorrectiveActions('inc-1');
    expect(service.listCorrectiveActions).toHaveBeenCalledWith('inc-1');
  });

  it('createCorrectiveAction forwards the incident id and dto', () => {
    const dto = { description: 'x', assignedToId: 'u1', dueDate: '2026-01-01T00:00:00.000Z' };
    controller.createCorrectiveAction('inc-1', dto);
    expect(service.createCorrectiveAction).toHaveBeenCalledWith('inc-1', dto);
  });

  it('updateCorrectiveAction forwards both ids and the dto', () => {
    const dto = { status: 'COMPLETED' as const };
    controller.updateCorrectiveAction('inc-1', 'act-1', dto);
    expect(service.updateCorrectiveAction).toHaveBeenCalledWith('inc-1', 'act-1', dto);
  });
});
