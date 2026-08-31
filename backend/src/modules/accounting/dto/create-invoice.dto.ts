export class CreateInvoiceDto {
  organizationId!: string;
  type!: 'PAYABLE' | 'RECEIVABLE';
  invoiceNumber!: string;
  subtotal!: number;
  tax?: number;
  projectId?: string;
  vendorId?: string;
  customerName?: string;
  issueDate?: string;
  dueDate?: string;
}
