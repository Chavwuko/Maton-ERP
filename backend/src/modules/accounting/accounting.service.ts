import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';

const INVOICE_INCLUDE = {
  payments: { orderBy: { createdAt: 'desc' as const } },
  documents: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 } } },
};

// PAID is deliberately unreachable from this map — it's only ever set by
// recordPayment() once the payments sum to the full total, same as
// Document Control's "children drive the parent's state" approval flip.
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['APPROVED', 'VOID'],
  APPROVED: ['VOID'],
  PAID: [],
  VOID: [],
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Vendors ---------------------------------------------------------------

  findAllVendors(filters: { organizationId?: string }) {
    return this.prisma.vendor.findMany({
      where: { organizationId: filters.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id }, include: { invoices: true } });
    if (!vendor) {
      throw new NotFoundException(`Vendor ${id} not found`);
    }
    return vendor;
  }

  async createVendor(dto: CreateVendorDto) {
    try {
      return await this.prisma.vendor.create({ data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Vendor "${dto.name}" already exists in this organization`);
      }
      throw err;
    }
  }

  // --- Invoices ----------------------------------------------------------------

  findAllInvoices(filters: {
    organizationId?: string;
    projectId?: string;
    vendorId?: string;
    status?: InvoiceStatus;
    type?: InvoiceType;
  }) {
    return this.prisma.invoice.findMany({
      where: {
        organizationId: filters.organizationId,
        projectId: filters.projectId,
        vendorId: filters.vendorId,
        status: filters.status,
        type: filters.type,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  async createInvoice(dto: CreateInvoiceDto) {
    if (dto.type === 'PAYABLE' && !dto.vendorId) {
      throw new BadRequestException('vendorId is required for a PAYABLE invoice');
    }
    if (dto.type === 'RECEIVABLE' && !dto.customerName) {
      throw new BadRequestException('customerName is required for a RECEIVABLE invoice');
    }
    if (dto.subtotal < 0 || (dto.tax ?? 0) < 0) {
      throw new BadRequestException('subtotal and tax must not be negative');
    }

    const subtotal = new Prisma.Decimal(dto.subtotal);
    const tax = new Prisma.Decimal(dto.tax ?? 0);
    const total = subtotal.plus(tax);

    try {
      return await this.prisma.invoice.create({
        data: {
          organizationId: dto.organizationId,
          projectId: dto.projectId,
          type: dto.type,
          vendorId: dto.type === 'PAYABLE' ? dto.vendorId : undefined,
          customerName: dto.type === 'RECEIVABLE' ? dto.customerName : undefined,
          invoiceNumber: dto.invoiceNumber,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          subtotal,
          tax,
          total,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Invoice number "${dto.invoiceNumber}" already exists in this organization`);
      }
      throw err;
    }
  }

  async updateStatus(id: string, dto: UpdateInvoiceStatusDto) {
    const invoice = await this.findInvoice(id);
    const allowed = ALLOWED_TRANSITIONS[invoice.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move invoice from ${invoice.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: dto.status },
      include: INVOICE_INCLUDE,
    });
  }

  async recordPayment(id: string, dto: CreatePaymentDto, recordedById: string) {
    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    const invoice = await this.findInvoice(id);
    if (invoice.status !== 'APPROVED') {
      throw new BadRequestException(`Invoice must be APPROVED to record a payment (currently ${invoice.status})`);
    }

    const paidSoFar = invoice.payments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Prisma.Decimal(0),
    );
    const remaining = new Prisma.Decimal(invoice.total).minus(paidSoFar);
    const amount = new Prisma.Decimal(dto.amount);

    if (amount.greaterThan(remaining)) {
      throw new BadRequestException(
        `Payment of ${amount.toFixed(2)} exceeds remaining balance of ${remaining.toFixed(2)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: { invoiceId: id, amount, method: dto.method, reference: dto.reference, recordedById },
      });

      if (amount.equals(remaining)) {
        await tx.invoice.update({ where: { id }, data: { status: 'PAID' } });
      }

      return tx.invoice.findUniqueOrThrow({ where: { id }, include: INVOICE_INCLUDE });
    });
  }
}
