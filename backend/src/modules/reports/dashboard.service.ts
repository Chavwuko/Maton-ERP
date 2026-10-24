import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { getSchedule, nowIn } from '../appointments/appointment-schedule';
import { InventoryService } from '../inventory/inventory.service';

// Roles that see the store-wide picture (stock value, spend, every
// appointment). Everyone else gets a dashboard about their own appointments.
export const MANAGEMENT_ROLES = ['admin', 'inventory', 'finance', 'viewer'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

// Largest values first, as { name, value } pairs for charts.
function rank(totals: Map<string, number>) {
  return [...totals]
    .map(([name, value]) => ({ name, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
}

function add(totals: Map<string, number>, key: string, amount: number) {
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

const APPOINTMENT_INCLUDE = {
  department: { select: { id: true, name: true } },
  requester: { select: { id: true, firstName: true, lastName: true, email: true } },
  feedbackBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: { include: { item: { select: { id: true, sku: true, name: true, unitOfMeasure: true } } } },
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  forUser(user: AuthenticatedUser) {
    return MANAGEMENT_ROLES.includes(user.roleName ?? '') ? this.management(user) : this.mine(user);
  }

  private async mine(user: AuthenticatedUser) {
    const { date: today } = nowIn((await getSchedule(this.prisma)).timeZone);
    const appointments = await this.prisma.appointment.findMany({
      where: { requesterId: user.id },
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    const count = (status: string) => appointments.filter((a) => a.status === status).length;

    return {
      kind: 'mine' as const,
      name: `${user.firstName} ${user.lastName}`.trim() || user.email,
      counts: { pending: count('PENDING'), approved: count('APPROVED'), completed: count('COMPLETED'), declined: count('DECLINED') },
      upcoming: appointments
        .filter((a) => (a.status === 'PENDING' || a.status === 'APPROVED') && dayOf(a.date) >= today)
        .slice(0, 6),
      feedback: appointments
        .filter((a) => a.feedback && a.feedbackAt)
        .sort((a, b) => b.feedbackAt!.getTime() - a.feedbackAt!.getTime())
        .slice(0, 5),
    };
  }

  private async management(user: AuthenticatedUser) {
    const { date: today } = nowIn((await getSchedule(this.prisma)).timeZone);
    const month = today.slice(0, 7);
    const months = this.lastMonths(today, 6);
    const since = new Date(`${months[0]}-01T00:00:00.000Z`);
    const cutoff = new Date(`${today}T00:00:00.000Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);

    const stock = await this.inventory.getStockOverview({});
    const kpi = { items: stock.length, stockValue: 0, low: 0, out: 0, purchasesMonth: 0, consumptionMonth: 0 };
    const byCategory = new Map<string, number>();
    for (const item of stock) {
      const value = Number(item.stockValue);
      kpi.stockValue += value;
      add(byCategory, item.category?.name ?? 'Uncategorised', value);
      if (item.status === 'OUT_OF_STOCK') kpi.out++;
      if (item.status === 'LOW_STOCK') kpi.low++;
    }
    const alerts = stock
      .filter((item) => item.status !== 'IN_STOCK')
      .sort((a, b) => a.totalOnHand - b.totalOnHand)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unitOfMeasure,
        onHand: item.totalOnHand,
        reorderPoint: item.reorderPoint,
        status: item.status,
      }));

    const purchases = await this.prisma.purchase.findMany({
      where: { deletedAt: null, date: { gte: since } },
      select: { date: true, total: true },
    });
    const consumptions = await this.prisma.consumption.findMany({
      // The six-month window is longer than the 90 days the rankings need.
      where: { deletedAt: null, date: { gte: since } },
      select: { date: true, total: true, item: { select: { name: true } }, department: { select: { name: true } } },
    });

    const purchasedBy = new Map<string, number>(months.map((m) => [m, 0]));
    const consumedBy = new Map<string, number>(months.map((m) => [m, 0]));
    purchases.forEach((p) => {
      const m = monthOf(p.date);
      if (purchasedBy.has(m)) add(purchasedBy, m, Number(p.total));
      if (m === month) kpi.purchasesMonth += Number(p.total);
    });
    const topConsumed = new Map<string, number>();
    const byDepartment = new Map<string, number>();
    consumptions.forEach((c) => {
      const m = monthOf(c.date);
      if (consumedBy.has(m)) add(consumedBy, m, Number(c.total));
      if (m === month) kpi.consumptionMonth += Number(c.total);
      if (c.date >= cutoff) {
        add(topConsumed, c.item.name, Number(c.total));
        add(byDepartment, c.department?.name ?? 'No department', Number(c.total));
      }
    });

    const open: ('PENDING' | 'APPROVED')[] = ['PENDING', 'APPROVED'];
    const isAdmin = user.roleName === 'admin';
    const [pendingAppointments, todayAppointments, accessRequests, upcoming, recent] = await Promise.all([
      this.prisma.appointment.count({ where: { status: 'PENDING' } }),
      this.prisma.appointment.count({ where: { status: { in: open }, date: new Date(today) } }),
      isAdmin ? this.prisma.user.count({ where: { status: 'PENDING' } }) : 0,
      this.prisma.appointment.findMany({
        where: { status: { in: open }, date: { gte: new Date(today) } },
        include: APPOINTMENT_INCLUDE,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        take: 8,
      }),
      this.prisma.stockTransaction.findMany({
        include: { item: { select: { sku: true, name: true, unitOfMeasure: true } }, warehouse: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    return {
      kind: 'management' as const,
      kpi: {
        items: kpi.items,
        stockValue: round2(kpi.stockValue),
        low: kpi.low,
        out: kpi.out,
        purchasesMonth: round2(kpi.purchasesMonth),
        consumptionMonth: round2(kpi.consumptionMonth),
      },
      actions: { pendingAppointments, todayAppointments, accessRequests },
      monthly: {
        labels: months,
        purchases: months.map((m) => round2(purchasedBy.get(m)!)),
        consumption: months.map((m) => round2(consumedBy.get(m)!)),
      },
      byCategory: rank(byCategory).filter((entry) => entry.value > 0),
      topConsumed: rank(topConsumed).slice(0, 6),
      byDepartment: rank(byDepartment).slice(0, 8),
      alerts,
      upcoming,
      recent,
    };
  }

  // "2026-10-24" -> the six months ending in October, oldest first.
  private lastMonths(today: string, count: number): string[] {
    const [year, month] = today.split('-').map(Number);
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
      return date.toISOString().slice(0, 7);
    });
  }
}
