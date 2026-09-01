import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as accountingApi from '../../api/accounting';
import { InvoicesListPage } from './InvoicesListPage';

vi.mock('../../api/accounting');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

const sampleInvoices = [
  {
    id: 'inv-1',
    organizationId: 'org-1',
    projectId: null,
    type: 'PAYABLE' as const,
    vendorId: 'vendor-1',
    customerName: null,
    invoiceNumber: 'INV-001',
    issueDate: '2026-01-01T00:00:00.000Z',
    dueDate: null,
    subtotal: '1000',
    tax: '80',
    total: '1080',
    status: 'DRAFT' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('InvoicesListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(accountingApi.listVendors).mockResolvedValue([]);
  });

  it('renders the invoices returned by the API, formatting the total', async () => {
    vi.mocked(accountingApi.listInvoices).mockResolvedValue(sampleInvoices);

    renderWithProviders(<InvoicesListPage />);

    expect(await screen.findByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('1,080')).toBeInTheDocument();
  });

  it('shows an empty state when there are no invoices', async () => {
    vi.mocked(accountingApi.listInvoices).mockResolvedValue([]);

    renderWithProviders(<InvoicesListPage />);

    expect(await screen.findByText('No invoices yet.')).toBeInTheDocument();
  });

  it('shows "New invoice" for admin/finance but not for a non-manager role', async () => {
    vi.mocked(accountingApi.listInvoices).mockResolvedValue([]);

    setCurrentRole('hse');
    renderWithProviders(<InvoicesListPage />);
    await screen.findByText('No invoices yet.');

    expect(screen.queryByRole('button', { name: 'New invoice' })).not.toBeInTheDocument();
  });

  it('requires a vendor for a PAYABLE invoice and creates it once picked', async () => {
    const user = userEvent.setup();
    vi.mocked(accountingApi.listInvoices).mockResolvedValue([]);
    vi.mocked(accountingApi.listVendors).mockResolvedValue([
      { id: 'vendor-1', organizationId: 'org-1', name: 'Acme Supplies', contactEmail: null, contactPhone: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    vi.mocked(accountingApi.createInvoice).mockResolvedValue({ ...sampleInvoices[0], id: 'inv-2' });

    renderWithProviders(<InvoicesListPage />);
    await screen.findByText('No invoices yet.');

    await user.click(screen.getByRole('button', { name: 'New invoice' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Invoice number', { exact: false }), 'INV-100');
    await user.click(screen.getByPlaceholderText('Select vendor'));
    await user.click(await screen.findByText('Acme Supplies'));
    await user.type(screen.getByLabelText('Subtotal', { exact: false }), '500');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(accountingApi.createInvoice).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        type: 'PAYABLE',
        invoiceNumber: 'INV-100',
        vendorId: 'vendor-1',
        subtotal: 500,
      });
    });
    expect(await screen.findByText('Invoice created')).toBeInTheDocument();
  });

  it('switches to a customer-name field for a RECEIVABLE invoice', async () => {
    const user = userEvent.setup();
    vi.mocked(accountingApi.listInvoices).mockResolvedValue([]);

    renderWithProviders(<InvoicesListPage />);
    await screen.findByText('No invoices yet.');

    await user.click(screen.getByRole('button', { name: 'New invoice' }));
    await user.click(await screen.findByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByText('RECEIVABLE'));

    expect(screen.getByLabelText('Customer name', { exact: false })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Select vendor')).not.toBeInTheDocument();
  });
});
