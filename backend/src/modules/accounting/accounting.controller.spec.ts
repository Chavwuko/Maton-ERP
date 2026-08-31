import { mockRequest } from '../../../test/utils/mock-request';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

describe('AccountingController', () => {
  let service: jest.Mocked<AccountingService>;
  let controller: AccountingController;

  beforeEach(() => {
    service = {
      findAllVendors: jest.fn(),
      findVendor: jest.fn(),
      createVendor: jest.fn(),
      findAllInvoices: jest.fn(),
      findInvoice: jest.fn(),
      createInvoice: jest.fn(),
      updateStatus: jest.fn(),
      recordPayment: jest.fn(),
    } as unknown as jest.Mocked<AccountingService>;
    controller = new AccountingController(service);
  });

  it('findAllVendors forwards organizationId', () => {
    controller.findAllVendors('org-1');
    expect(service.findAllVendors).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('findVendor forwards the id', () => {
    controller.findVendor('v1');
    expect(service.findVendor).toHaveBeenCalledWith('v1');
  });

  it('createVendor forwards the dto', () => {
    const dto = { organizationId: 'org-1', name: 'Acme' };
    controller.createVendor(dto);
    expect(service.createVendor).toHaveBeenCalledWith(dto);
  });

  it('findAllInvoices forwards every filter', () => {
    controller.findAllInvoices('org-1', 'proj-1', 'v1', 'DRAFT' as never, 'PAYABLE' as never);
    expect(service.findAllInvoices).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      vendorId: 'v1',
      status: 'DRAFT',
      type: 'PAYABLE',
    });
  });

  it('findInvoice forwards the id', () => {
    controller.findInvoice('inv-1');
    expect(service.findInvoice).toHaveBeenCalledWith('inv-1');
  });

  it('createInvoice forwards the dto', () => {
    const dto = { organizationId: 'org-1', type: 'PAYABLE' as const, vendorId: 'v1', invoiceNumber: 'INV-1', subtotal: 100 };
    controller.createInvoice(dto);
    expect(service.createInvoice).toHaveBeenCalledWith(dto);
  });

  it('updateStatus forwards the id and dto', () => {
    controller.updateStatus('inv-1', { status: 'APPROVED' });
    expect(service.updateStatus).toHaveBeenCalledWith('inv-1', { status: 'APPROVED' });
  });

  it('recordPayment forwards the id, dto, and req.user.id', () => {
    const dto = { amount: 500 };
    const req = mockRequest({ id: 'user-9' });

    controller.recordPayment('inv-1', dto, req);

    expect(service.recordPayment).toHaveBeenCalledWith('inv-1', dto, 'user-9');
  });
});
