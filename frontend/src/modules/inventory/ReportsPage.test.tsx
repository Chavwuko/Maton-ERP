import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ApiError } from '../../api/client';
import * as reportsApi from '../../api/reports';
import { saveTextFile } from '../../lib/saveFile';
import { ReportsPage } from './ReportsPage';
import type { InventoryReport } from './reportTypes';

vi.mock('../../api/reports');
vi.mock('../../lib/saveFile', () => ({ saveTextFile: vi.fn() }));

const report: InventoryReport = {
  totals: {
    purchases: 1750.5,
    consumption: 675,
    purchaseLines: 3,
    issueLines: 7,
    appointments: 6,
    appointmentsCompleted: 3,
    appointmentsPending: 2,
  },
  bySupplier: [{ name: 'Apex Supplies', total: 1000, count: 2 }],
  byProject: [{ name: 'P-1 — Substation', total: 400, count: 4 }],
  byDepartment: [{ name: 'Workshop', total: 275.5, count: 3 }],
  byItem: [{ sku: 'GLV-1', name: 'Gloves', unit: 'pcs', quantity: 12.5, value: 62.5 }],
  valuation: [{ name: 'PPE', items: 4, value: 300 }],
};

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.mocked(reportsApi.getInventoryReport).mockResolvedValue(report);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the totals and every breakdown', async () => {
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText('1,750.50')).toBeInTheDocument();
    expect(screen.getByText('675.00')).toBeInTheDocument();
    expect(screen.getByText('3 / 7')).toBeInTheDocument();
    expect(screen.getByText('6 (3 / 2)')).toBeInTheDocument();
    expect(screen.getByText('Apex Supplies')).toBeInTheDocument();
    expect(screen.getByText('P-1 — Substation')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getByText('GLV-1 — Gloves')).toBeInTheDocument();
    expect(screen.getByText('12.5 pcs')).toBeInTheDocument();
    expect(screen.getByText('PPE')).toBeInTheDocument();
  });

  it('says so when a period has no data', async () => {
    vi.mocked(reportsApi.getInventoryReport).mockResolvedValue({
      ...report,
      bySupplier: [],
      byProject: [],
      byDepartment: [],
      byItem: [],
      valuation: [],
    });

    renderWithProviders(<ReportsPage />);

    expect(await screen.findAllByText('No data for this period.')).toHaveLength(4);
    expect(screen.getByText('No stock yet.')).toBeInTheDocument();
  });

  it('re-queries for the chosen date range', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Apex Supplies');

    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.type(screen.getByLabelText('To'), '2026-10-31');

    await waitFor(() => {
      expect(vi.mocked(reportsApi.getInventoryReport)).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-31' });
    });
  });

  it('shows an error when the report cannot be loaded', async () => {
    vi.mocked(reportsApi.getInventoryReport).mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'));
    const { unmount } = renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
    unmount();

    vi.mocked(reportsApi.getInventoryReport).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('downloads a section as CSV for the chosen range', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.downloadReportCsv).mockResolvedValue({ filename: 'suppliers.csv', text: 'a,b' });
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Apex Supplies');
    await user.type(screen.getByLabelText('From'), '2026-10-01');

    const section = screen.getByText('Spend by supplier').closest('div')!.parentElement!;
    await user.click(within(section).getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(vi.mocked(reportsApi.downloadReportCsv).mock.calls[0]).toEqual(['suppliers', { from: '2026-10-01', to: undefined }]);
    });
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledWith('suppliers.csv', 'a,b'));
  });

  it('offers the full stock, purchase and issue exports', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.downloadReportCsv).mockResolvedValue({ filename: 'x.csv', text: '' });
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Apex Supplies');

    await user.click(screen.getByRole('button', { name: 'Stock list' }));
    await user.click(screen.getByRole('button', { name: 'All purchases' }));
    await user.click(screen.getByRole('button', { name: 'All issues' }));

    await waitFor(() => {
      expect(vi.mocked(reportsApi.downloadReportCsv).mock.calls.map((call) => call[0])).toEqual(['stock', 'purchases', 'consumption']);
    });
  });

  it('surfaces an export failure', async () => {
    const user = userEvent.setup();
    vi.mocked(reportsApi.downloadReportCsv)
      .mockRejectedValueOnce(new ApiError(400, 'type must be one of: suppliers'))
      .mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Apex Supplies');

    await user.click(screen.getByRole('button', { name: 'Stock list' }));
    expect(await screen.findByText('type must be one of: suppliers')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stock list' }));
    expect(await screen.findByText('Failed to export')).toBeInTheDocument();
    expect(saveTextFile).not.toHaveBeenCalled();
  });
});
