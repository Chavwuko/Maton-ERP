import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { toCsv } from './csv';

export const CSV_TYPES = [
  'suppliers',
  'projects',
  'departments',
  'items',
  'valuation',
  'stock',
  'purchases',
  'consumption',
] as const;
export type CsvType = (typeof CSV_TYPES)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const day = (date: Date) => date.toISOString().slice(0, 10);

interface Totals {
  name: string;
  total: number;
  count: number;
}

function tally(map: Map<string, Totals>, name: string, amount: number) {
  const entry = map.get(name) ?? { name, total: 0, count: 0 };
  entry.total += amount;
  entry.count += 1;
  map.set(name, entry);
}

const byTotal = (map: Map<string, Totals>) =>
  [...map.values()].map((e) => ({ ...e, total: round2(e.total) })).sort((a, b) => b.total - a.total);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // Spend, usage and stock value over a date range (everything when no range).
  async inventoryReport(filters: { from?: string; to?: string }) {
    const data = await this.collect(filters);

    return {
      totals: {
        purchases: data.totalPurchases,
        consumption: data.totalConsumption,
        purchaseLines: data.purchases.length,
        issueLines: data.consumptions.length,
        appointments: data.appointmentCounts.total,
        appointmentsCompleted: data.appointmentCounts.COMPLETED,
        appointmentsPending: data.appointmentCounts.PENDING,
      },
      bySupplier: data.bySupplier,
      byProject: data.byProject,
      byDepartment: data.byDepartment,
      byItem: data.byItem.slice(0, 25),
      valuation: data.valuation,
    };
  }

  async csv(type: string, filters: { from?: string; to?: string }) {
    if (!(CSV_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`type must be one of: ${CSV_TYPES.join(', ')}`);
    }
    const data = await this.collect(filters);
    const sheets: Record<CsvType, { headers: string[]; rows: (string | number | null)[][] }> = {
      suppliers: { headers: ['Supplier', 'Purchases', 'Total spend'], rows: data.bySupplier.map((r) => [r.name, r.count, r.total]) },
      projects: { headers: ['Project', 'Issues', 'Total cost'], rows: data.byProject.map((r) => [r.name, r.count, r.total]) },
      departments: { headers: ['Department', 'Issues', 'Total cost'], rows: data.byDepartment.map((r) => [r.name, r.count, r.total]) },
      items: {
        headers: ['SKU', 'Item', 'Unit', 'Quantity issued', 'Cost'],
        rows: data.byItem.map((r) => [r.sku, r.name, r.unit, r.quantity, r.value]),
      },
      valuation: { headers: ['Category', 'Items', 'Value'], rows: data.valuation.map((r) => [r.name, r.items, r.value]) },
      stock: {
        headers: ['SKU', 'Name', 'Category', 'Unit', 'Location', 'On hand', 'Reorder point', 'Unit cost', 'Value', 'Status'],
        rows: data.stock.map((s) => [
          s.sku,
          s.name,
          s.category?.name ?? '',
          s.unitOfMeasure,
          s.location,
          s.totalOnHand,
          s.reorderPoint,
          Number(s.unitCost),
          Number(s.stockValue),
          s.status,
        ]),
      },
      purchases: {
        headers: ['Date', 'PO', 'SKU', 'Item', 'Supplier', 'Quantity', 'Unit cost', 'Total'],
        rows: data.purchases.map((p) => [
          day(p.date),
          p.poNumber,
          p.item.sku,
          p.item.name,
          p.vendor.name,
          p.quantity,
          Number(p.unitCost),
          Number(p.total),
        ]),
      },
      consumption: {
        headers: ['Date', 'SKU', 'Item', 'Quantity', 'Department', 'Project', 'Issued to', 'Purpose', 'Cost'],
        rows: data.consumptions.map((c) => [
          day(c.date),
          c.item.sku,
          c.item.name,
          c.quantity,
          c.department?.name ?? '',
          c.project ? `${c.project.code} - ${c.project.name}` : '',
          c.issuedTo,
          c.purpose,
          Number(c.total),
        ]),
      },
    };
    const range = [filters.from, filters.to].filter(Boolean).join('_to_');
    return {
      filename: `${type}${range ? `-${range}` : ''}.csv`,
      content: toCsv(sheets[type as CsvType].headers, sheets[type as CsvType].rows),
    };
  }

  private async collect(filters: { from?: string; to?: string }) {
    const date = this.dateRange(filters);

    const [purchases, consumptions, stock, appointmentGroups] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { deletedAt: null, date },
        include: { item: { select: { sku: true, name: true } }, vendor: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.consumption.findMany({
        where: { deletedAt: null, date },
        include: {
          item: { select: { sku: true, name: true, unitOfMeasure: true } },
          project: { select: { code: true, name: true } },
          department: { select: { name: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.inventory.getStockOverview({}),
      this.prisma.appointment.groupBy({ by: ['status'], where: { date }, _count: { _all: true } }),
    ]);

    const supplierTotals = new Map<string, Totals>();
    let totalPurchases = 0;
    purchases.forEach((p) => {
      tally(supplierTotals, p.vendor.name, Number(p.total));
      totalPurchases += Number(p.total);
    });

    const projectTotals = new Map<string, Totals>();
    const departmentTotals = new Map<string, Totals>();
    const itemTotals = new Map<string, { sku: string; name: string; unit: string; quantity: number; value: number }>();
    let totalConsumption = 0;
    consumptions.forEach((c) => {
      const cost = Number(c.total);
      totalConsumption += cost;
      tally(projectTotals, c.project ? `${c.project.code} — ${c.project.name}` : 'No project', cost);
      tally(departmentTotals, c.department?.name ?? 'No department', cost);
      const item = itemTotals.get(c.itemId) ?? { sku: c.item.sku, name: c.item.name, unit: c.item.unitOfMeasure, quantity: 0, value: 0 };
      item.quantity += c.quantity;
      item.value += cost;
      itemTotals.set(c.itemId, item);
    });

    const categories = new Map<string, { name: string; items: number; value: number }>();
    stock.forEach((item) => {
      const name = item.category?.name ?? 'Uncategorised';
      const entry = categories.get(name) ?? { name, items: 0, value: 0 };
      entry.items += 1;
      entry.value += Number(item.stockValue);
      categories.set(name, entry);
    });

    const appointmentCounts = { total: 0, PENDING: 0, COMPLETED: 0 } as Record<string, number>;
    appointmentGroups.forEach((group) => {
      appointmentCounts.total += group._count._all;
      if (group.status in appointmentCounts) appointmentCounts[group.status] = group._count._all;
    });

    return {
      purchases,
      consumptions,
      stock,
      totalPurchases: round2(totalPurchases),
      totalConsumption: round2(totalConsumption),
      appointmentCounts,
      bySupplier: byTotal(supplierTotals),
      byProject: byTotal(projectTotals),
      byDepartment: byTotal(departmentTotals),
      byItem: [...itemTotals.values()]
        .map((i) => ({ ...i, quantity: round3(i.quantity), value: round2(i.value) }))
        .sort((a, b) => b.value - a.value),
      valuation: [...categories.values()].map((c) => ({ ...c, value: round2(c.value) })).sort((a, b) => b.value - a.value),
    };
  }

  private dateRange(filters: { from?: string; to?: string }) {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('from and to must be dates like 2026-10-24');
    }
    if (to) to.setUTCHours(23, 59, 59, 999);
    return from || to ? { gte: from, lte: to } : undefined;
  }
}
