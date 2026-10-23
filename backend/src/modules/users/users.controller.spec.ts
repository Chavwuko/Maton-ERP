import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let service: jest.Mocked<UsersService>;
  let controller: UsersController;
  const req = { user: { id: 'admin-1' } } as never;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      disable: jest.fn(),
      enable: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    controller = new UsersController(service);
  });

  it('findAll delegates the role filter, with isActive and status undefined when omitted', () => {
    controller.findAll('document_control');
    expect(service.findAll).toHaveBeenCalledWith({ role: 'document_control', isActive: undefined, status: undefined });
  });

  it('findAll passes an array of roles through as-is (repeated ?role= query params)', () => {
    controller.findAll(['document_control', 'admin']);
    expect(service.findAll).toHaveBeenCalledWith({
      role: ['document_control', 'admin'],
      isActive: undefined,
      status: undefined,
    });
  });

  it('findAll parses isActive=true from the query string', () => {
    controller.findAll(undefined, 'true');
    expect(service.findAll).toHaveBeenCalledWith({ role: undefined, isActive: true, status: undefined });
  });

  it('findAll parses isActive=false from the query string', () => {
    controller.findAll(undefined, 'false');
    expect(service.findAll).toHaveBeenCalledWith({ role: undefined, isActive: false, status: undefined });
  });

  it('findAll passes the status filter through', () => {
    controller.findAll(undefined, undefined, 'PENDING');
    expect(service.findAll).toHaveBeenCalledWith({ role: undefined, isActive: undefined, status: 'PENDING' });
  });

  it('findOne delegates the id', () => {
    controller.findOne('user-1');
    expect(service.findOne).toHaveBeenCalledWith('user-1');
  });

  it('update delegates the id and body', () => {
    controller.update('user-1', { roleName: 'hse' });
    expect(service.update).toHaveBeenCalledWith('user-1', { roleName: 'hse' });
  });

  it('approve records the acting admin as the reviewer', () => {
    controller.approve('user-1', { roleName: 'inventory' }, req);
    expect(service.approve).toHaveBeenCalledWith('user-1', { roleName: 'inventory' }, 'admin-1');
  });

  it('reject records the acting admin as the reviewer', () => {
    controller.reject('user-1', { reason: 'Not a colleague' }, req);
    expect(service.reject).toHaveBeenCalledWith('user-1', { reason: 'Not a colleague' }, 'admin-1');
  });

  it('disable and enable record the acting admin', () => {
    controller.disable('user-1', req);
    controller.enable('user-2', req);
    expect(service.disable).toHaveBeenCalledWith('user-1', 'admin-1');
    expect(service.enable).toHaveBeenCalledWith('user-2', 'admin-1');
  });
});
