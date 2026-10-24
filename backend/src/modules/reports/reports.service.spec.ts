import { BadRequestException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import type { InventoryService } from '../inventory/inventory.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

const purchase = (overrides = {}) => ({
  date: new Date('2026-10-05'),
  poNumber: 'PO-1',
  quantity: 10,
  unitCost: '5.00',
  total: '50.00',
  item: { sku: 'GLV-1', name: 'Gloves' },
  vendor: { name: 'Apex Supplies' },
  ...overrides,
});

const issue = (overrides = {}) => ({
  date: new Date('2026-10-06'),
  itemId: 'item-1',
  quantity: 4,
  total: '20.00',
  issuedTo: 'Joe',
  purpose: 'Repairs',
  item: { sku: 'GLV-1', name: 'Gloves', unitOfMeasure: 'pcs' },
  project: { code: 'P-1', name: 'Substation' },
  department: { name: 'Workshop' },
  ...overrides,
});

const stockRow = (overrides = {}) => ({
  sku: 'GLV-1',
  name: 'Gloves',
  unitOfMeasure: 'pcs',
  location: 'Rack A',
  reorderPoint: 5,
  unitCost: '5.00',
  totalOnHand: 6,
  stockValue: '30.00',
  status: 'IN_STOCK',
  category: { name: 'PPE' },
  ...overrides,
});

describe('ReportsService', () => {
  let prisma: MockPrisma;
  // The generic groupBy signature defeats the deep mock's typing.
  const groupBy = () => prisma.appointment.groupBy as unknown as jest.Mock;
  let inventory: { getStockOverview: jest.Mock };
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    inventory = { getStockOverview: jest.fn().mockResolvedValue([stockRow()]) };
    service = new ReportsService(prisma, inventory as unknown as InventoryService);
    prisma.purchase.findMany.mockResolvedValue([purchase()] as never);
    prisma.consumption.findMany.mockResolvedValue([issue()] as never);
    groupBy().mockResolvedValue([
      { status: 'COMPLETED', _count: { _all: 3 } },
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'DECLINED', _count: { _all: 1 } },
    ] as never);
  });

  describe('inventoryReport', () => {
    it('totals spend and usage, grouped by supplier, project, department, item and category', async () => {
      prisma.purchase.findMany.mockResolvedValue([
        purchase(),
        purchase({ total: '25.50' }),
        purchase({ vendor: { name: 'Bolt Bros' }, total: '100.00' }),
      ] as never);
      prisma.consumption.findMany.mockResolvedValue([
        issue(),
        issue({ quantity: 1.5, total: '7.50' }),
        issue({ itemId: 'item-2', item: { sku: 'BLT-1', name: 'Bolts', unitOfMeasure: 'pcs' }, project: null, department: null, total: '40.00' }),
      ] as never);
      inventory.getStockOverview.mockResolvedValue([
        stockRow(),
        stockRow({ stockValue: '10.00' }),
        stockRow({ category: null, stockValue: '99.99' }),
      ]);

      const report = await service.inventoryReport({});

      expect(report.totals).toEqual({
        purchases: 175.5,
        consumption: 67.5,
        purchaseLines: 3,
        issueLines: 3,
        appointments: 6,
        appointmentsCompleted: 3,
        appointmentsPending: 2,
      });
      expect(report.bySupplier).toEqual([
        { name: 'Bolt Bros', total: 100, count: 1 },
        { name: 'Apex Supplies', total: 75.5, count: 2 },
      ]);
      expect(report.byProject).toEqual([
        { name: 'No project', total: 40, count: 1 },
        { name: 'P-1 — Substation', total: 27.5, count: 2 },
      ]);
      expect(report.byDepartment.map((r) => r.name)).toEqual(['No department', 'Workshop']);
      expect(report.byItem).toEqual([
        { sku: 'BLT-1', name: 'Bolts', unit: 'pcs', quantity: 4, value: 40 },
        { sku: 'GLV-1', name: 'Gloves', unit: 'pcs', quantity: 5.5, value: 27.5 },
      ]);
      expect(report.valuation).toEqual([
        { name: 'Uncategorised', items: 1, value: 99.99 },
        { name: 'PPE', items: 2, value: 40 },
      ]);
    });

    it('is empty when there is no activity, and ignores appointment statuses it does not report', async () => {
      prisma.purchase.findMany.mockResolvedValue([] as never);
      prisma.consumption.findMany.mockResolvedValue([] as never);
      groupBy().mockResolvedValue([] as never);
      inventory.getStockOverview.mockResolvedValue([]);

      const report = await service.inventoryReport({});

      expect(report.totals).toMatchObject({ purchases: 0, consumption: 0, appointments: 0, appointmentsCompleted: 0 });
      expect(report.bySupplier).toEqual([]);
      expect(report.valuation).toEqual([]);
    });

    it('limits the item ranking to 25', async () => {
      prisma.consumption.findMany.mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => issue({ itemId: `item-${i}`, total: String(i + 1) })) as never,
      );

      expect((await service.inventoryReport({})).byItem).toHaveLength(25);
    });

    it('filters purchases, issues and appointments by the date range, inclusive of the last day', async () => {
      await service.inventoryReport({ from: '2026-10-01', to: '2026-10-31' });

      const range = { gte: new Date('2026-10-01'), lte: new Date('2026-10-31T23:59:59.999Z') };
      expect(prisma.purchase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, date: range } }));
      expect(prisma.consumption.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, date: range } }));
      expect(groupBy()).toHaveBeenCalledWith(expect.objectContaining({ where: { date: range } }));
    });

    it('accepts a range with only one end', async () => {
      await service.inventoryReport({ from: '2026-10-01' });
      await service.inventoryReport({ to: '2026-10-31' });

      const dates = prisma.purchase.findMany.mock.calls.map(([arg]) => arg!.where!.date);
      expect(dates[0]).toEqual({ gte: new Date('2026-10-01'), lte: undefined });
      expect(dates[1]).toEqual({ gte: undefined, lte: new Date('2026-10-31T23:59:59.999Z') });
    });

    it('rejects malformed dates', async () => {
      await expect(service.inventoryReport({ from: 'soon' })).rejects.toThrow(BadRequestException);
      await expect(service.inventoryReport({ to: 'later' })).rejects.toThrow('from and to must be dates');
    });
  });

  describe('csv', () => {
    const lines = async (type: string, filters = {}) => (await service.csv(type, filters)).content.replace('﻿', '').split('\r\n');

    it('rejects an unknown type', async () => {
      await expect(service.csv('secrets', {})).rejects.toThrow('type must be one of');
    });

    it('exports each summary', async () => {
      expect(await lines('suppliers')).toEqual(['Supplier,Purchases,Total spend', 'Apex Supplies,1,50', '']);
      expect(await lines('projects')).toEqual(['Project,Issues,Total cost', 'P-1 — Substation,1,20', '']);
      expect(await lines('departments')).toEqual(['Department,Issues,Total cost', 'Workshop,1,20', '']);
      expect(await lines('items')).toEqual(['SKU,Item,Unit,Quantity issued,Cost', 'GLV-1,Gloves,pcs,4,20', '']);
      expect(await lines('valuation')).toEqual(['Category,Items,Value', 'PPE,1,30', '']);
    });

    it('exports the stock list with blank category and location when they are missing', async () => {
      inventory.getStockOverview.mockResolvedValue([stockRow(), stockRow({ sku: 'X', category: null, location: null, reorderPoint: null })]);

      expect(await lines('stock')).toEqual([
        'SKU,Name,Category,Unit,Location,On hand,Reorder point,Unit cost,Value,Status',
        'GLV-1,Gloves,PPE,pcs,Rack A,6,5,5,30,IN_STOCK',
        'X,Gloves,,pcs,,6,,5,30,IN_STOCK',
        '',
      ]);
    });

    it('exports every purchase and issue line, not just a top list', async () => {
      prisma.purchase.findMany.mockResolvedValue([purchase(), purchase({ poNumber: null })] as never);
      prisma.consumption.findMany.mockResolvedValue([issue(), issue({ project: null, department: null, issuedTo: null, purpose: null })] as never);

      expect(await lines('purchases')).toEqual([
        'Date,PO,SKU,Item,Supplier,Quantity,Unit cost,Total',
        '2026-10-05,PO-1,GLV-1,Gloves,Apex Supplies,10,5,50',
        '2026-10-05,,GLV-1,Gloves,Apex Supplies,10,5,50',
        '',
      ]);
      expect(await lines('consumption')).toEqual([
        'Date,SKU,Item,Quantity,Department,Project,Issued to,Purpose,Cost',
        '2026-10-06,GLV-1,Gloves,4,Workshop,P-1 - Substation,Joe,Repairs,20',
        '2026-10-06,GLV-1,Gloves,4,,,,,20',
        '',
      ]);
    });

    it('names the file after the type and the range', async () => {
      expect((await service.csv('suppliers', {})).filename).toBe('suppliers.csv');
      expect((await service.csv('suppliers', { from: '2026-10-01' })).filename).toBe('suppliers-2026-10-01.csv');
      expect((await service.csv('stock', { from: '2026-10-01', to: '2026-10-31' })).filename).toBe('stock-2026-10-01_to_2026-10-31.csv');
    });
  });
});

describe('ReportsController', () => {
  const dashboard = { forUser: jest.fn() };
  const reports = { inventoryReport: jest.fn(), csv: jest.fn() };
  const controller = new ReportsController(dashboard as never, reports as never);

  it('dashboard asks for the signed-in user', () => {
    controller.dashboard({ user: { id: 'u1' } } as never);

    expect(dashboard.forUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('inventoryReport passes the range', () => {
    controller.inventoryReport('2026-10-01', '2026-10-31');

    expect(reports.inventoryReport).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('csv sets the download headers and returns the file text', async () => {
    reports.csv.mockResolvedValue({ filename: 'suppliers.csv', content: 'a,b' });
    const res = { setHeader: jest.fn() };

    const body = await controller.csv('suppliers', undefined, undefined, res as never);

    expect(body).toBe('a,b');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="suppliers.csv"');
  });
});
