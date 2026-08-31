import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

describe('ProjectsController', () => {
  let service: jest.Mocked<ProjectsService>;
  let controller: ProjectsController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      listMilestones: jest.fn(),
      createMilestone: jest.fn(),
      updateMilestone: jest.fn(),
    } as unknown as jest.Mocked<ProjectsService>;
    controller = new ProjectsController(service);
  });

  it('findAll forwards organizationId and status', () => {
    controller.findAll('org-1', 'ACTIVE' as never);
    expect(service.findAll).toHaveBeenCalledWith({ organizationId: 'org-1', status: 'ACTIVE' });
  });

  it('findOne forwards the id', () => {
    controller.findOne('p1');
    expect(service.findOne).toHaveBeenCalledWith('p1');
  });

  it('create forwards the dto', () => {
    const dto = { organizationId: 'org-1', code: 'PRJ-1', name: 'X' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('updateStatus forwards the id and dto', () => {
    controller.updateStatus('p1', { status: 'ACTIVE' as never });
    expect(service.updateStatus).toHaveBeenCalledWith('p1', { status: 'ACTIVE' });
  });

  it('listMilestones forwards the project id', () => {
    controller.listMilestones('p1');
    expect(service.listMilestones).toHaveBeenCalledWith('p1');
  });

  it('createMilestone forwards the project id and dto', () => {
    const dto = { name: 'M', dueDate: '2026-01-01T00:00:00.000Z' };
    controller.createMilestone('p1', dto);
    expect(service.createMilestone).toHaveBeenCalledWith('p1', dto);
  });

  it('updateMilestone forwards both ids and the dto', () => {
    const dto = { status: 'COMPLETED' as const };
    controller.updateMilestone('p1', 'm1', dto);
    expect(service.updateMilestone).toHaveBeenCalledWith('p1', 'm1', dto);
  });
});
