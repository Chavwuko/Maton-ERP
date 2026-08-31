import { DocumentControlService } from '../document-control/document-control.service';
import { mockRequest } from '../../../test/utils/mock-request';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

function fakeFile(): Express.Multer.File {
  return { originalname: 'f.txt', mimetype: 'text/plain', buffer: Buffer.from('x'), size: 1 } as Express.Multer.File;
}

describe('EmployeesController', () => {
  let employeesService: jest.Mocked<EmployeesService>;
  let documentControlService: jest.Mocked<DocumentControlService>;
  let controller: EmployeesController;

  beforeEach(() => {
    employeesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByUserId: jest.fn(),
      create: jest.fn(),
      updateEmploymentStatus: jest.fn(),
    } as unknown as jest.Mocked<EmployeesService>;
    documentControlService = {
      findAll: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<DocumentControlService>;
    controller = new EmployeesController(employeesService, documentControlService);
  });

  it('findMe resolves the caller\'s own employee record from req.user.id', async () => {
    const req = mockRequest({ id: 'user-1' });
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);

    const result = await controller.findMe(req);

    expect(employeesService.findByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'emp-1' });
  });

  it('findMyDocuments resolves my employee id first, then filters documents by it', async () => {
    const req = mockRequest({ id: 'user-1' });
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1' } as never);
    documentControlService.findAll.mockResolvedValue([] as never);

    await controller.findMyDocuments(req);

    expect(employeesService.findByUserId).toHaveBeenCalledWith('user-1');
    expect(documentControlService.findAll).toHaveBeenCalledWith({ employeeId: 'emp-1' });
  });

  it('a failure to resolve the caller\'s employee record propagates without calling documentControlService', async () => {
    const req = mockRequest({ id: 'user-1' });
    employeesService.findByUserId.mockRejectedValue(new Error('no employee'));

    await expect(controller.findMyDocuments(req)).rejects.toThrow('no employee');
    expect(documentControlService.findAll).not.toHaveBeenCalled();
  });

  it('uploadMyDocument derives organizationId/employeeId from the caller\'s own record, not the request body', async () => {
    const req = mockRequest({ id: 'user-1' });
    const file = fakeFile();
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-1', organizationId: 'org-1' } as never);
    documentControlService.create.mockResolvedValue({ id: 'doc-1' } as never);

    await controller.uploadMyDocument({ title: 'ID Card', category: 'ID' }, file, req);

    expect(documentControlService.create).toHaveBeenCalledWith(
      { organizationId: 'org-1', employeeId: 'emp-1', title: 'ID Card', category: 'ID', description: undefined },
      'user-1',
      file,
    );
  });

  it('findDocuments (admin/hr viewing a specific employee) filters by the :id param directly', () => {
    controller.findDocuments('emp-5');
    expect(documentControlService.findAll).toHaveBeenCalledWith({ employeeId: 'emp-5' });
    expect(employeesService.findByUserId).not.toHaveBeenCalled();
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'ACTIVE' as never, 'mgr-1');
    expect(employeesService.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      employmentStatus: 'ACTIVE',
      managerId: 'mgr-1',
    });
  });

  it('findOne forwards the id', () => {
    controller.findOne('emp-1');
    expect(employeesService.findOne).toHaveBeenCalledWith('emp-1');
  });

  it('create forwards the dto', () => {
    const dto = { organizationId: 'org-1', userId: 'u1', employeeNumber: 'E1', jobTitle: 'x', hireDate: '2022-01-01T00:00:00.000Z' };
    controller.create(dto);
    expect(employeesService.create).toHaveBeenCalledWith(dto);
  });

  it('updateStatus forwards the id and dto', () => {
    controller.updateStatus('emp-1', { employmentStatus: 'ON_LEAVE' });
    expect(employeesService.updateEmploymentStatus).toHaveBeenCalledWith('emp-1', { employmentStatus: 'ON_LEAVE' });
  });
});
