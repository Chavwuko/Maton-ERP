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
      findAllCategories: jest.fn(),
      createCategory: jest.fn(),
      findAllItems: jest.fn(),
      getStockOverview: jest.fn(),
      findItem: jest.fn(),
      createItem: jest.fn(),
      updateItem: jest.fn(),
      deleteItem: jest.fn(),
      findTransactions: jest.fn(),
      recordTransaction: jest.fn(),
      adjustStock: jest.fn(),
      transfer: jest.fn(),
      findPurchases: jest.fn(),
      recordPurchase: jest.fn(),
      deletePurchase: jest.fn(),
      findConsumptions: jest.fn(),
      recordConsumption: jest.fn(),
      deleteConsumption: jest.fn(),
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

  it('createItem forwards the dto and req.user.id (for the opening-balance ledger row)', () => {
    const dto = { organizationId: 'org-1', sku: 'SKU-1', name: 'Bolt', unitOfMeasure: 'EA' };
    controller.createItem(dto, mockRequest({ id: 'user-9' }));
    expect(service.createItem).toHaveBeenCalledWith(dto, 'user-9');
  });

  it('updateItem forwards the id and dto', () => {
    controller.updateItem('item-1', { name: 'New' });
    expect(service.updateItem).toHaveBeenCalledWith('item-1', { name: 'New' });
  });

  it('deleteItem forwards the id', () => {
    controller.deleteItem('item-1');
    expect(service.deleteItem).toHaveBeenCalledWith('item-1');
  });

  it('getStockOverview forwards organizationId', () => {
    controller.getStockOverview('org-1');
    expect(service.getStockOverview).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('findAllCategories forwards organizationId and createCategory the dto', () => {
    controller.findAllCategories('org-1');
    expect(service.findAllCategories).toHaveBeenCalledWith({ organizationId: 'org-1' });

    const dto = { organizationId: 'org-1', name: 'Electrical' };
    controller.createCategory(dto);
    expect(service.createCategory).toHaveBeenCalledWith(dto);
  });

  it('findTransactions forwards every filter', () => {
    controller.findTransactions('item-1', 'wh-1', 'wo-1', 'ISSUE', '2026-06-01', '2026-06-30');
    expect(service.findTransactions).toHaveBeenCalledWith({
      itemId: 'item-1',
      warehouseId: 'wh-1',
      workOrderId: 'wo-1',
      type: 'ISSUE',
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('adjustStock forwards the dto and req.user.id', () => {
    const dto = { itemId: 'i1', warehouseId: 'w1', countedQuantity: 5, reason: 'Count' };
    controller.adjustStock(dto, mockRequest({ id: 'user-9' }));
    expect(service.adjustStock).toHaveBeenCalledWith(dto, 'user-9');
  });

  it('findPurchases forwards every filter', () => {
    controller.findPurchases('org-1', 'v1', 'i1', '2026-06-01', '2026-06-30');
    expect(service.findPurchases).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vendorId: 'v1',
      itemId: 'i1',
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('recordPurchase and deletePurchase forward req.user.id', () => {
    const dto = { warehouseId: 'w1', itemId: 'i1', vendorId: 'v1', quantity: 5, unitCost: 2 };
    controller.recordPurchase(dto, mockRequest({ id: 'user-9' }));
    expect(service.recordPurchase).toHaveBeenCalledWith(dto, 'user-9');

    controller.deletePurchase('p1', mockRequest({ id: 'user-9' }));
    expect(service.deletePurchase).toHaveBeenCalledWith('p1', 'user-9');
  });

  it('findConsumptions forwards every filter', () => {
    controller.findConsumptions('org-1', 'd1', 'pr1', 'i1', '2026-06-01', '2026-06-30');
    expect(service.findConsumptions).toHaveBeenCalledWith({
      organizationId: 'org-1',
      departmentId: 'd1',
      projectId: 'pr1',
      itemId: 'i1',
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('recordConsumption and deleteConsumption forward req.user.id', () => {
    const dto = { warehouseId: 'w1', itemId: 'i1', quantity: 2, departmentId: 'd1' };
    controller.recordConsumption(dto, mockRequest({ id: 'user-9' }));
    expect(service.recordConsumption).toHaveBeenCalledWith(dto, 'user-9');

    controller.deleteConsumption('c1', mockRequest({ id: 'user-9' }));
    expect(service.deleteConsumption).toHaveBeenCalledWith('c1', 'user-9');
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
