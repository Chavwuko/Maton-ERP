import { INestApplication } from '@nestjs/common';
import { asRole } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Accounting (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof asRole>;
  let orgId: string;
  let vendorId: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = asRole(app, 'admin');
    const org = await admin.post('/organizations').send({ name: 'AcctCo' });
    orgId = org.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /vendors is restricted to admin/finance', async () => {
    const res = await asRole(app, 'hse').post('/vendors').send({ organizationId: orgId, name: 'Acme Parts' });
    expect(res.status).toBe(403);
  });

  it('creates a vendor and rejects a duplicate name with 409', async () => {
    const created = await admin.post('/vendors').send({ organizationId: orgId, name: 'Acme Parts' });
    expect(created.status).toBe(201);
    vendorId = created.body.id;

    const dup = await admin.post('/vendors').send({ organizationId: orgId, name: 'Acme Parts' });
    expect(dup.status).toBe(409);
  });

  it('rejects a PAYABLE invoice with no vendorId', async () => {
    const res = await admin
      .post('/invoices')
      .send({ organizationId: orgId, type: 'PAYABLE', invoiceNumber: 'INV-001', subtotal: 1000 });
    expect(res.status).toBe(400);
  });

  it('rejects a RECEIVABLE invoice with no customerName', async () => {
    const res = await admin
      .post('/invoices')
      .send({ organizationId: orgId, type: 'RECEIVABLE', invoiceNumber: 'INV-002', subtotal: 500 });
    expect(res.status).toBe(400);
  });

  let invoiceId: string;

  it('creates a PAYABLE invoice with a server-computed total', async () => {
    const res = await admin.post('/invoices').send({
      organizationId: orgId,
      type: 'PAYABLE',
      vendorId,
      invoiceNumber: 'INV-001',
      subtotal: 1000,
      tax: 80,
    });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe('1080');
    expect(res.body.status).toBe('DRAFT');
    invoiceId = res.body.id;
  });

  it('rejects a duplicate invoice number with 409', async () => {
    const res = await admin
      .post('/invoices')
      .send({ organizationId: orgId, type: 'PAYABLE', vendorId, invoiceNumber: 'INV-001', subtotal: 1 });
    expect(res.status).toBe(409);
  });

  it('rejects a payment on a DRAFT invoice', async () => {
    const res = await admin.post(`/invoices/${invoiceId}/payments`).send({ amount: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects manually setting status to PAID', async () => {
    const res = await admin.patch(`/invoices/${invoiceId}/status`).send({ status: 'PAID' });
    expect(res.status).toBe(400);
  });

  it('approves the invoice', async () => {
    const res = await admin.patch(`/invoices/${invoiceId}/status`).send({ status: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  it('rejects an overpayment against the total', async () => {
    const res = await admin.post(`/invoices/${invoiceId}/payments`).send({ amount: 2000 });
    expect(res.status).toBe(400);
  });

  it('accepts a partial payment and stays APPROVED', async () => {
    const res = await admin
      .post(`/invoices/${invoiceId}/payments`)
      .send({ amount: 500, method: 'wire', reference: 'WT-1' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
  });

  it('rejects a payment exceeding the remaining balance', async () => {
    const res = await admin.post(`/invoices/${invoiceId}/payments`).send({ amount: 600 });
    expect(res.status).toBe(400);
  });

  it('the exact remaining payment flips the invoice to PAID', async () => {
    const res = await admin.post(`/invoices/${invoiceId}/payments`).send({ amount: 580 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PAID');
  });

  it('no further payments or status changes are allowed once PAID', async () => {
    const payment = await admin.post(`/invoices/${invoiceId}/payments`).send({ amount: 10 });
    expect(payment.status).toBe(400);

    const voidAttempt = await admin.patch(`/invoices/${invoiceId}/status`).send({ status: 'VOID' });
    expect(voidAttempt.status).toBe(400);
  });

  it('a RECEIVABLE invoice can move DRAFT -> VOID directly', async () => {
    const created = await admin.post('/invoices').send({
      organizationId: orgId,
      type: 'RECEIVABLE',
      customerName: 'Contoso Ltd',
      invoiceNumber: 'INV-100',
      subtotal: 2000,
      tax: 160,
    });
    expect(created.body.total).toBe('2160');

    const voided = await admin.patch(`/invoices/${created.body.id}/status`).send({ status: 'VOID' });
    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe('VOID');
  });

  it('a document created with invoiceId links to the invoice both ways', async () => {
    const doc = await admin
      .post('/documents')
      .field('organizationId', orgId)
      .field('invoiceId', invoiceId)
      .field('title', 'Vendor Invoice PDF')
      .attach('file', Buffer.from('pdf'), 'invoice.txt');
    expect(doc.status).toBe(201);

    const filtered = await admin.get(`/documents?invoiceId=${invoiceId}`);
    expect(filtered.body).toHaveLength(1);

    const detail = await admin.get(`/invoices/${invoiceId}`);
    expect(detail.body.documents).toHaveLength(1);
  });
});
