import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeAppointment } from '../../test/fixtures';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as reportsApi from '../../api/reports';
import { InventoryDashboardPage } from './InventoryDashboardPage';
import type { ManagementDashboard, MyDashboard } from './reportTypes';

vi.mock('../../api/reports');

const management: ManagementDashboard = {
  kind: 'management',
  kpi: { items: 12, stockValue: 4567.5, low: 3, out: 1, purchasesMonth: 1200, consumptionMonth: 800.25 },
  actions: { pendingAppointments: 4, todayAppointments: 2, accessRequests: 5 },
  monthly: {
    labels: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
    purchases: [0, 10, 20, 30, 40, 50],
    consumption: [5, 5, 5, 5, 5, 5],
  },
  byCategory: [{ name: 'PPE', value: 100 }],
  topConsumed: [{ name: 'Gloves', value: 25 }],
  byDepartment: [{ name: 'Workshop', value: 28 }],
  alerts: [
    { id: 'i1', sku: 'BLT-1', name: 'Bolts', unit: 'pcs', onHand: 0, reorderPoint: 20, status: 'OUT_OF_STOCK' },
    { id: 'i2', sku: 'NUT-1', name: 'Nuts', unit: 'pcs', onHand: 3.5, reorderPoint: null, status: 'LOW_STOCK' },
  ],
  upcoming: [makeAppointment()],
  recent: [
    {
      id: 'txn-1',
      type: 'RECEIPT',
      quantity: 20,
      createdAt: '2026-10-20T10:00:00.000Z',
      item: { sku: 'GLV-1', name: 'Work gloves', unitOfMeasure: 'pcs' },
      warehouse: { code: 'MAIN' },
    },
    {
      id: 'txn-2',
      type: 'MYSTERY',
      quantity: 1,
      createdAt: '2026-10-21T10:00:00.000Z',
      item: { sku: 'GLV-1', name: 'Work gloves', unitOfMeasure: 'pcs' },
      warehouse: { code: 'MAIN' },
    },
  ],
};

const mine: MyDashboard = {
  kind: 'mine',
  name: 'Ann Store',
  counts: { pending: 1, approved: 2, completed: 3, declined: 4 },
  upcoming: [makeAppointment({ subject: 'My booking' })],
  feedback: [
    makeAppointment({
      id: 'f1',
      subject: 'Old request',
      feedback: 'Handed over',
      feedbackBy: { id: 'k', firstName: 'Kay', lastName: 'Keeper', email: 'kay@acme.test' },
    }),
    makeAppointment({ id: 'f2', subject: 'Other request', feedback: 'See you then', feedbackBy: null }),
  ],
};

describe('InventoryDashboardPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('for the store', () => {
    beforeEach(() => {
      vi.mocked(reportsApi.getInventoryDashboard).mockResolvedValue(management);
    });

    it('shows what needs attention, as links, and the headline numbers', async () => {
      renderWithProviders(<InventoryDashboardPage />);

      expect(await screen.findByText('Appointments awaiting review')).toBeInTheDocument();
      expect(screen.getByText('Appointments awaiting review').closest('a')).toHaveAttribute('href', '/appointments?tab=all');
      expect(screen.getByText('Sign-up requests waiting').closest('a')).toHaveAttribute('href', '/users?tab=requests');
      expect(screen.getByText('4,567.50')).toBeInTheDocument();
      expect(screen.getByText('1,200.00')).toBeInTheDocument();
      expect(screen.getByText('800.25')).toBeInTheDocument();
      expect(screen.getByText('Purchases vs issues, last 6 months')).toBeInTheDocument();
    });

    it('hides the sign-up card from the inventory role', async () => {
      setCurrentRole('inventory');
      renderWithProviders(<InventoryDashboardPage />);

      await screen.findByText('Appointments awaiting review');
      expect(screen.queryByText('Sign-up requests waiting')).not.toBeInTheDocument();
    });

    it('lists stock alerts with links to the items', async () => {
      renderWithProviders(<InventoryDashboardPage />);

      const link = await screen.findByRole('link', { name: 'BLT-1' });
      expect(link).toHaveAttribute('href', '/inventory/items/i1');
      const table = within(link.closest('table')!);
      expect(table.getByText('Out of stock')).toBeInTheDocument();
      expect(table.getByText('Low stock')).toBeInTheDocument();
      expect(table.getByText('3.5 pcs')).toBeInTheDocument();
      expect(table.getByText('20')).toBeInTheDocument();
    });

    it('lists upcoming appointments and recent movements', async () => {
      renderWithProviders(<InventoryDashboardPage />);

      expect(await screen.findByText('Gloves for new hires')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('RECEIPT')).toBeInTheDocument();
      expect(screen.getByText('MYSTERY')).toBeInTheDocument();
      expect(screen.getAllByText('GLV-1 — Work gloves')).toHaveLength(2);
    });

    it('says so when there is nothing to show', async () => {
      vi.mocked(reportsApi.getInventoryDashboard).mockResolvedValue({
        ...management,
        alerts: [],
        upcoming: [],
        recent: [],
        byCategory: [],
      });

      renderWithProviders(<InventoryDashboardPage />);

      expect(await screen.findByText('Nothing is low or out of stock.')).toBeInTheDocument();
      expect(screen.getByText('No upcoming appointments.')).toBeInTheDocument();
      expect(screen.getByText('No stock movements yet.')).toBeInTheDocument();
    });
  });

  describe('for everyone else', () => {
    beforeEach(() => {
      setCurrentRole('staff');
      vi.mocked(reportsApi.getInventoryDashboard).mockResolvedValue(mine);
    });

    it('shows my own appointment counts, what is coming up, and the store\'s feedback', async () => {
      renderWithProviders(<InventoryDashboardPage />);

      expect(await screen.findByText('Hello, Ann Store.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Book an appointment' })).toHaveAttribute('href', '/appointments');
      expect(screen.getByText('My booking')).toBeInTheDocument();
      expect(screen.getByText('Handed over')).toBeInTheDocument();
      expect(screen.getByText('— Kay Keeper')).toBeInTheDocument();
      expect(screen.getByText('See you then')).toBeInTheDocument();
      expect(screen.queryByText('Stock value')).not.toBeInTheDocument();
    });

    it('says so when there is nothing booked and no feedback', async () => {
      vi.mocked(reportsApi.getInventoryDashboard).mockResolvedValue({ ...mine, upcoming: [], feedback: [] });

      renderWithProviders(<InventoryDashboardPage />);

      expect(await screen.findByText('You have nothing booked.')).toBeInTheDocument();
      expect(screen.getByText('No feedback yet.')).toBeInTheDocument();
    });
  });

  it('shows an error when the dashboard cannot be loaded', async () => {
    vi.mocked(reportsApi.getInventoryDashboard).mockRejectedValueOnce(new ApiError(500, 'Server down'));
    const { unmount } = renderWithProviders(<InventoryDashboardPage />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
    unmount();

    vi.mocked(reportsApi.getInventoryDashboard).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<InventoryDashboardPage />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
