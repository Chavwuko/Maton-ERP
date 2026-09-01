export type InvoiceType = 'PAYABLE' | 'RECEIVABLE';
export type InvoiceStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'VOID';

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  invoices?: Invoice[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: string;
  method: string | null;
  reference: string | null;
  recordedById: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  projectId: string | null;
  type: InvoiceType;
  vendorId: string | null;
  customerName: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: string;
  tax: string;
  total: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
}

// PAID is deliberately unreachable here — it's only ever set by
// recordPayment() once payments sum to the full total.
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['APPROVED', 'VOID'],
  APPROVED: ['VOID'],
  PAID: [],
  VOID: [],
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'blue',
  APPROVED: 'yellow',
  PAID: 'green',
  VOID: 'gray',
};
