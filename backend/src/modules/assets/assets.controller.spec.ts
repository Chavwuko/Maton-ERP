import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

describe('AssetsController', () => {
  let service: jest.Mocked<AssetsService>;
  let controller: AssetsController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;
    controller = new AssetsController(service);
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'ACTIVE' as never, 'proj-1');
    expect(service.findAll).toHaveBeenCalledWith({ organizationId: 'org-1', status: 'ACTIVE', projectId: 'proj-1' });
  });

  it('findOne forwards the id', () => {
    controller.findOne('a1');
    expect(service.findOne).toHaveBeenCalledWith('a1');
  });

  it('create forwards the dto', () => {
    const dto = { organizationId: 'org-1', assetTag: 'PUMP-1', name: 'Pump', category: 'x' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });
});
