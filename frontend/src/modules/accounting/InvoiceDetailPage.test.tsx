import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as accountingApi from '../../api/accounting';
import { InvoiceDetailPage } from './InvoiceDetailPage';
import type { Invoice } from './types';

vi.mock('../../api/accounting');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'inv-1' }) };
});

const baseInvoice: Invoice = {
  id: 'inv-1',
  organizationId: 'org-1',
  projectId: null,
  type: 'PAYABLE',
  vendorId: 'vendor-1',
  customerName: null,
  invoiceNumber: 'INV-001',
  issueDate: '2026-01-01T00:00:00.000Z',
  dueDate: null,
  subtotal: '1000',
  tax: '80',
  total: '1080',
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  payments: [],
};

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('offers only the legal next statuses for DRAFT', async () => {
    const user = userEvent.setup();
    vi.mocked(accountingApi.getInvoice).mockResolvedValue(baseInvoice);

    renderWithProviders(<InvoiceDetailPage />);
    await screen.findByText('INV-001');

    await user.click(screen.getByRole('button', { name: /DRAFT/i }));

    expect(await screen.findByText('Move to APPROVED')).toBeInTheDocument();
    expect(screen.getByText('Move to VOID')).toBeInTheDocument();
  });

  it('does not offer "Record payment" until the invoice is APPROVED', async () => {
    vi.mocked(accountingApi.getInvoice).mockResolvedValue(baseInvoice);

    renderWithProviders(<InvoiceDetailPage />);
    await screen.findByText('INV-001');

    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
  });

  it('records a payment once APPROVED and shows the remaining balance', async () => {
    const user = userEvent.setup();
    const approved = { ...baseInvoice, status: 'APPROVED' as const };
    vi.mocked(accountingApi.getInvoice).mockResolvedValue(approved);
    vi.mocked(accountingApi.recordPayment).mockResolvedValue({
      ...approved,
      payments: [{ id: 'p1', invoiceId: 'inv-1', amount: '1080', method: null, reference: null, recordedById: 'user-1', createdAt: '2026-01-01T00:00:00.000Z' }],
    });

    renderWithProviders(<InvoiceDetailPage />);
    await screen.findByText('INV-001');

    // Total and remaining balance both show 1,080 since no payments exist yet.
    expect(screen.getAllByText('1,080')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await user.type(await screen.findByLabelText('Amount', { exact: false }), '1080');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    await waitFor(() => {
      expect(vi.mocked(accountingApi.recordPayment).mock.calls[0]).toEqual(['inv-1', { amount: 1080, method: undefined, reference: undefined }]);
    });
    expect(await screen.findByText('Payment recorded')).toBeInTheDocument();
  });

  it('hides the status menu for a non-manager role', async () => {
    setCurrentRole('hse');
    vi.mocked(accountingApi.getInvoice).mockResolvedValue(baseInvoice);

    renderWithProviders(<InvoiceDetailPage />);
    await screen.findByText('INV-001');

    expect(screen.queryByRole('button', { name: /DRAFT/i })).not.toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });
});
