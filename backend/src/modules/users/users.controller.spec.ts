import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let service: jest.Mocked<UsersService>;
  let controller: UsersController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    controller = new UsersController(service);
  });

  it('findAll delegates the role filter, with isActive undefined when omitted', () => {
    controller.findAll('document_control');
    expect(service.findAll).toHaveBeenCalledWith({ role: 'document_control', isActive: undefined });
  });

  it('findAll passes an array of roles through as-is (repeated ?role= query params)', () => {
    controller.findAll(['document_control', 'admin']);
    expect(service.findAll).toHaveBeenCalledWith({ role: ['document_control', 'admin'], isActive: undefined });
  });

  it('findAll parses isActive=true from the query string', () => {
    controller.findAll(undefined, 'true');
    expect(service.findAll).toHaveBeenCalledWith({ role: undefined, isActive: true });
  });

  it('findAll parses isActive=false from the query string', () => {
    controller.findAll(undefined, 'false');
    expect(service.findAll).toHaveBeenCalledWith({ role: undefined, isActive: false });
  });

  it('findOne delegates the id', () => {
    controller.findOne('user-1');
    expect(service.findOne).toHaveBeenCalledWith('user-1');
  });
});
