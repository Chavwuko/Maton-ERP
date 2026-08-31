import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { AccountingService } from './accounting.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';

// Any authenticated user can read; every mutation (registering a vendor,
// raising/approving/paying an invoice) is restricted to admin/finance —
// same reasoning as Inventory: these change figures other people rely on.
@Controller()
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('vendors')
  findAllVendors(@Query('organizationId') organizationId?: string) {
    return this.accountingService.findAllVendors({ organizationId });
  }

  @Get('vendors/:id')
  findVendor(@Param('id') id: string) {
    return this.accountingService.findVendor(id);
  }

  @Roles('admin', 'finance')
  @Post('vendors')
  createVendor(@Body() dto: CreateVendorDto) {
    return this.accountingService.createVendor(dto);
  }

  @Get('invoices')
  findAllInvoices(
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string,
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('type') type?: InvoiceType,
  ) {
    return this.accountingService.findAllInvoices({ organizationId, projectId, vendorId, status, type });
  }

  @Get('invoices/:id')
  findInvoice(@Param('id') id: string) {
    return this.accountingService.findInvoice(id);
  }

  @Roles('admin', 'finance')
  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.accountingService.createInvoice(dto);
  }

  @Roles('admin', 'finance')
  @Patch('invoices/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.accountingService.updateStatus(id, dto);
  }

  @Roles('admin', 'finance')
  @Post('invoices/:id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: CreatePaymentDto, @Req() req: Request) {
    return this.accountingService.recordPayment(id, dto, req.user!.id);
  }
}
