import { mockRequest } from '../../../test/utils/mock-request';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let service: jest.Mocked<InventoryService>;
  let controller: InventoryController;

  beforeEach(() => {
    service = {
      findAllWarehouses: jest.fn(),
      findWarehouse: jest.fn(),
      createWarehouse: jest.fn(),
      findAllItems: jest.fn(),
      findItem: jest.fn(),
      createItem: jest.fn(),
      findTransactions: jest.fn(),
      recordTransaction: jest.fn(),
      transfer: jest.fn(),
    } as unknown as jest.Mocked<InventoryService>;
    controller = new InventoryController(service);
  });

  it('findAllWarehouses forwards organizationId', () => {
    controller.findAllWarehouses('org-1');
    expect(service.findAllWarehouses).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('findWarehouse forwards the id', () => {
    controller.findWarehouse('wh-1');
    expect(service.findWarehouse).toHaveBeenCalledWith('wh-1');
  });

  it('createWarehouse forwards the dto', () => {
    const dto = { organizationId: 'org-1', code: 'WH-1', name: 'Main' };
    controller.createWarehouse(dto);
    expect(service.createWarehouse).toHaveBeenCalledWith(dto);
  });

  describe('findAllItems belowReorderPoint mapping', () => {
    it('the literal string "true" maps to boolean true', () => {
      controller.findAllItems('org-1', 'true');
      expect(service.findAllItems).toHaveBeenCalledWith({ organizationId: 'org-1', belowReorderPoint: true });
    });

    it.each([undefined, 'false', 'yes', '1'])('anything else (%s) maps to boolean false', (value) => {
      controller.findAllItems('org-1', value);
      expect(service.findAllItems).toHaveBeenCalledWith({ organizationId: 'org-1', belowReorderPoint: false });
    });
  });

  it('findItem forwards the id', () => {
    controller.findItem('item-1');
    expect(service.findItem).toHaveBeenCalledWith('item-1');
  });

  it('createItem forwards the dto', () => {
    const dto = { organizationId: 'org-1', sku: 'SKU-1', name: 'Bolt', unitOfMeasure: 'EA' };
    controller.createItem(dto);
    expect(service.createItem).toHaveBeenCalledWith(dto);
  });

  it('findTransactions forwards every filter', () => {
    controller.findTransactions('item-1', 'wh-1', 'wo-1');
    expect(service.findTransactions).toHaveBeenCalledWith({
      itemId: 'item-1',
      warehouseId: 'wh-1',
      workOrderId: 'wo-1',
    });
  });

  it('recordTransaction forwards the dto and req.user.id', () => {
    const dto = { itemId: 'i1', warehouseId: 'w1', type: 'RECEIPT' as const, quantity: 5 };
    const req = mockRequest({ id: 'user-9' });

    controller.recordTransaction(dto, req);

    expect(service.recordTransaction).toHaveBeenCalledWith(dto, 'user-9');
  });

  it('transfer forwards the dto and req.user.id', () => {
    const dto = { itemId: 'i1', fromWarehouseId: 'w1', toWarehouseId: 'w2', quantity: 5 };
    const req = mockRequest({ id: 'user-9' });

    controller.transfer(dto, req);

    expect(service.transfer).toHaveBeenCalledWith(dto, 'user-9');
  });
});
