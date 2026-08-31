import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { AccountingService } from './accounting.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.20.0' });
}

describe('AccountingService', () => {
  let prisma: MockPrisma;
  let service: AccountingService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AccountingService(prisma);
  });

  describe('findAllVendors', () => {
    it('delegates straight to prisma.vendor.findMany, filtered by organizationId', async () => {
      const vendors = [{ id: 'v1' }];
      prisma.vendor.findMany.mockResolvedValue(vendors as never);

      const result = await service.findAllVendors({ organizationId: 'org-1' });

      expect(prisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result).toEqual(vendors);
    });
  });

  describe('createVendor', () => {
    it('turns a P2002 conflict into a ConflictException naming the vendor', async () => {
      prisma.vendor.create.mockRejectedValue(p2002());

      await expect(service.createVendor({ organizationId: 'org-1', name: 'Acme Supplies' })).rejects.toThrow(
        /Acme Supplies/,
      );
    });

    it('creates the vendor when the name is free', async () => {
      prisma.vendor.create.mockResolvedValue({ id: 'v1', name: 'Acme Supplies' } as never);

      const result = await service.createVendor({ organizationId: 'org-1', name: 'Acme Supplies' });

      expect(result).toEqual({ id: 'v1', name: 'Acme Supplies' });
    });

    it('rethrows unrelated errors', async () => {
      prisma.vendor.create.mockRejectedValue(new Error('boom'));

      await expect(service.createVendor({ organizationId: 'org-1', name: 'Acme Supplies' })).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('findAllInvoices', () => {
    it('delegates straight to prisma.invoice.findMany with the given filters', async () => {
      const invoices = [{ id: 'inv-1' }];
      prisma.invoice.findMany.mockResolvedValue(invoices as never);

      const result = await service.findAllInvoices({ organizationId: 'org-1', status: 'DRAFT' });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', status: 'DRAFT' }) }),
      );
      expect(result).toEqual(invoices);
    });
  });

  describe('findInvoice', () => {
    it('404s when missing', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.findInvoice('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createInvoice', () => {
    it('rejects PAYABLE with no vendorId', async () => {
      await expect(
        service.createInvoice({ organizationId: 'org-1', type: 'PAYABLE', invoiceNumber: 'INV-1', subtotal: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects RECEIVABLE with no customerName', async () => {
      await expect(
        service.createInvoice({ organizationId: 'org-1', type: 'RECEIVABLE', invoiceNumber: 'INV-1', subtotal: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a negative subtotal or tax', async () => {
      await expect(
        service.createInvoice({
          organizationId: 'org-1',
          type: 'PAYABLE',
          vendorId: 'v1',
          invoiceNumber: 'INV-1',
          subtotal: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes total = subtotal + tax server-side', async () => {
      prisma.invoice.create.mockResolvedValue({} as never);

      await service.createInvoice({
        organizationId: 'org-1',
        type: 'PAYABLE',
        vendorId: 'v1',
        invoiceNumber: 'INV-1',
        subtotal: 1000,
        tax: 80,
      });

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.total?.toString()).toBe('1080');
      expect(data.subtotal?.toString()).toBe('1000');
      expect(data.tax?.toString()).toBe('80');
    });

    it('creates a RECEIVABLE invoice under customerName, with no vendorId', async () => {
      prisma.invoice.create.mockResolvedValue({} as never);

      await service.createInvoice({
        organizationId: 'org-1',
        type: 'RECEIVABLE',
        customerName: 'Acme Corp',
        invoiceNumber: 'INV-2',
        subtotal: 200,
        issueDate: '2026-01-01T00:00:00.000Z',
        dueDate: '2026-02-01T00:00:00.000Z',
      });

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.customerName).toBe('Acme Corp');
      expect(data.vendorId).toBeUndefined();
      expect(data.issueDate).toBeInstanceOf(Date);
      expect(data.dueDate).toBeInstanceOf(Date);
    });

    it('defaults tax to 0 when omitted', async () => {
      prisma.invoice.create.mockResolvedValue({} as never);

      await service.createInvoice({
        organizationId: 'org-1',
        type: 'PAYABLE',
        vendorId: 'v1',
        invoiceNumber: 'INV-1',
        subtotal: 500,
      });

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.total?.toString()).toBe('500');
    });

    it('turns a P2002 conflict into a ConflictException naming the invoice number', async () => {
      prisma.invoice.create.mockRejectedValue(p2002());

      await expect(
        service.createInvoice({
          organizationId: 'org-1',
          type: 'PAYABLE',
          vendorId: 'v1',
          invoiceNumber: 'INV-1',
          subtotal: 1,
        }),
      ).rejects.toThrow(/INV-1/);
    });

    it('rethrows unrelated errors', async () => {
      prisma.invoice.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createInvoice({
          organizationId: 'org-1',
          type: 'PAYABLE',
          vendorId: 'v1',
          invoiceNumber: 'INV-1',
          subtotal: 1,
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('updateStatus', () => {
    it.each([
      ['DRAFT', 'PAID'],
      ['APPROVED', 'PAID'],
      ['PAID', 'APPROVED'],
      ['VOID', 'DRAFT'],
    ])('rejects %s -> %s (PAID is only reachable via payments)', async (from, to) => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: from } as never);

      await expect(service.updateStatus('inv-1', { status: to as never })).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['DRAFT', 'APPROVED'],
      ['DRAFT', 'VOID'],
      ['APPROVED', 'VOID'],
    ])('allows %s -> %s', async (from, to) => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: from } as never);
      prisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: to } as never);

      const result = await service.updateStatus('inv-1', { status: to as never });

      expect(result).toEqual({ id: 'inv-1', status: to });
    });
  });

  describe('recordPayment', () => {
    it('rejects a non-positive amount', async () => {
      await expect(service.recordPayment('inv-1', { amount: 0 }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects paying an invoice that is not APPROVED', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'DRAFT', payments: [], total: 100 } as never);

      await expect(service.recordPayment('inv-1', { amount: 10 }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a payment exceeding the remaining balance, naming both figures', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'APPROVED',
        total: 1080,
        payments: [{ amount: 500 }],
      } as never);

      await expect(service.recordPayment('inv-1', { amount: 600 }, 'user-1')).rejects.toThrow(
        /Payment of 600\.00 exceeds remaining balance of 580\.00/,
      );
    });

    it('a partial payment does not flip the invoice to PAID', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'APPROVED',
        total: 1080,
        payments: [],
      } as never);
      prisma.payment.create.mockResolvedValue({} as never);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv-1', status: 'APPROVED' } as never);

      await service.recordPayment('inv-1', { amount: 500 }, 'user-1');

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('a payment equal to the exact remaining balance flips the invoice to PAID', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'APPROVED',
        total: 1080,
        payments: [{ amount: 500 }],
      } as never);
      prisma.payment.create.mockResolvedValue({} as never);
      prisma.invoice.update.mockResolvedValue({} as never);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv-1', status: 'PAID' } as never);

      const result = await service.recordPayment('inv-1', { amount: 580 }, 'user-1');

      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PAID' } });
      expect(result).toEqual({ id: 'inv-1', status: 'PAID' });
    });
  });

  describe('findVendor', () => {
    it('404s when missing', async () => {
      prisma.vendor.findUnique.mockResolvedValue(null);
      await expect(service.findVendor('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the vendor (with invoices) when found', async () => {
      const found = { id: 'v1', invoices: [] };
      prisma.vendor.findUnique.mockResolvedValue(found as never);

      await expect(service.findVendor('v1')).resolves.toEqual(found);
    });
  });
});
