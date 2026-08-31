import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsController', () => {
  let service: jest.Mocked<OrganizationsService>;
  let controller: OrganizationsController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<OrganizationsService>;
    controller = new OrganizationsController(service);
  });

  it('findAll delegates with no arguments', () => {
    controller.findAll();
    expect(service.findAll).toHaveBeenCalledWith();
  });

  it('findOne delegates the id', () => {
    controller.findOne('org-1');
    expect(service.findOne).toHaveBeenCalledWith('org-1');
  });

  it('create delegates the dto', () => {
    const dto = { name: 'Acme' };
    controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });
});
