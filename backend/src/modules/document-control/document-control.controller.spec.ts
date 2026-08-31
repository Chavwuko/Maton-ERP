import { mockRequest } from '../../../test/utils/mock-request';
import { DocumentControlController } from './document-control.controller';
import { DocumentControlService } from './document-control.service';

function fakeFile(): Express.Multer.File {
  return { originalname: 'f.txt', mimetype: 'text/plain', buffer: Buffer.from('x'), size: 1 } as Express.Multer.File;
}

describe('DocumentControlController', () => {
  let service: jest.Mocked<DocumentControlService>;
  let controller: DocumentControlController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      addVersion: jest.fn(),
      getDownloadUrl: jest.fn(),
      submitForReview: jest.fn(),
      recordDecision: jest.fn(),
    } as unknown as jest.Mocked<DocumentControlService>;
    controller = new DocumentControlController(service);
  });

  it('findAll forwards every filter query param', () => {
    controller.findAll('org-1', 'DRAFT' as never, 'dept-1', 'proj-1', 'wo-1', 'inv-1', 'inc-1', 'emp-1');
    expect(service.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: 'DRAFT',
      departmentId: 'dept-1',
      projectId: 'proj-1',
      workOrderId: 'wo-1',
      invoiceId: 'inv-1',
      incidentId: 'inc-1',
      employeeId: 'emp-1',
    });
  });

  it('findOne delegates the id', () => {
    controller.findOne('doc-1');
    expect(service.findOne).toHaveBeenCalledWith('doc-1');
  });

  it('create passes the uploaded file and req.user.id as ownerId', () => {
    const dto = { organizationId: 'org-1', title: 't' };
    const file = fakeFile();
    const req = mockRequest({ id: 'user-42' });

    controller.create(dto, file, req);

    expect(service.create).toHaveBeenCalledWith(dto, 'user-42', file);
  });

  it('addVersion passes the document id, req.user.id, and file', () => {
    const file = fakeFile();
    const req = mockRequest({ id: 'user-42' });

    controller.addVersion('doc-1', file, req);

    expect(service.addVersion).toHaveBeenCalledWith('doc-1', 'user-42', file);
  });

  it('getDownloadUrl passes both ids through', () => {
    controller.getDownloadUrl('doc-1', 'v1');
    expect(service.getDownloadUrl).toHaveBeenCalledWith('doc-1', 'v1');
  });

  it('submitForReview passes the id and dto', () => {
    const dto = { reviewerIds: ['u1'] };
    controller.submitForReview('doc-1', dto);
    expect(service.submitForReview).toHaveBeenCalledWith('doc-1', dto);
  });

  it('recordDecision passes the id, req.user.id as reviewerId, and dto', () => {
    const dto = { status: 'APPROVED' as const };
    const req = mockRequest({ id: 'reviewer-9' });

    controller.recordDecision('doc-1', dto, req);

    expect(service.recordDecision).toHaveBeenCalledWith('doc-1', 'reviewer-9', dto);
  });
});
