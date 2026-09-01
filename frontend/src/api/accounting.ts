import { apiClient } from './client';
import type { Invoice, InvoiceStatus, InvoiceType, Vendor } from '../modules/accounting/types';

export function listVendors(filters: { organizationId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set('organizationId', filters.organizationId);
  const qs = params.toString();
  return apiClient.get<Vendor[]>(`/vendors${qs ? `?${qs}` : ''}`);
}

export function getVendor(id: string) {
  return apiClient.get<Vendor>(`/vendors/${id}`);
}

export function createVendor(data: { organizationId: string; name: string; contactEmail?: string; contactPhone?: string }) {
  return apiClient.post<Vendor>('/vendors', data);
}

export function listInvoices(
  filters: {
    organizationId?: string;
    projectId?: string;
    vendorId?: string;
    status?: InvoiceStatus;
    type?: InvoiceType;
  } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return apiClient.get<Invoice[]>(`/invoices${qs ? `?${qs}` : ''}`);
}

export function getInvoice(id: string) {
  return apiClient.get<Invoice>(`/invoices/${id}`);
}

export function createInvoice(data: {
  organizationId: string;
  type: InvoiceType;
  invoiceNumber: string;
  subtotal: number;
  tax?: number;
  projectId?: string;
  vendorId?: string;
  customerName?: string;
  issueDate?: string;
  dueDate?: string;
}) {
  return apiClient.post<Invoice>('/invoices', data);
}

export function updateInvoiceStatus(id: string, status: Extract<InvoiceStatus, 'APPROVED' | 'VOID'>) {
  return apiClient.patch<Invoice>(`/invoices/${id}/status`, { status });
}

// Returns the updated Invoice (with the new payment nested in .payments),
// not the bare Payment row — matches recordPayment()'s tx.invoice.findUniqueOrThrow.
export function recordPayment(id: string, data: { amount: number; method?: string; reference?: string }) {
  return apiClient.post<Invoice>(`/invoices/${id}/payments`, data);
}
