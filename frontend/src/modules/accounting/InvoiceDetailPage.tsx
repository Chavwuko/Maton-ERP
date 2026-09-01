import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, NumberInput, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getInvoice, recordPayment, updateInvoiceStatus } from '../../api/accounting';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { StatusMenu } from '../../components/StatusMenu';
import { INVOICE_STATUS_COLORS, INVOICE_TRANSITIONS, type InvoiceStatus } from './types';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'finance']);

  const {
    data: invoice,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  });

  const paymentForm = useForm({
    initialValues: { amount: '' as number | string, method: '', reference: '' },
    validate: { amount: (value) => (value === '' || Number(value) <= 0 ? 'Amount must be positive' : null) },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['invoices', id] });

  const statusMutation = useMutation({
    mutationFn: (status: InvoiceStatus) => updateInvoiceStatus(id!, status as Extract<InvoiceStatus, 'APPROVED' | 'VOID'>),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  const paymentMutation = useMutation({
    mutationFn: (values: typeof paymentForm.values) =>
      recordPayment(id!, {
        amount: Number(values.amount),
        method: values.method || undefined,
        reference: values.reference || undefined,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Payment recorded', color: 'green' });
      paymentForm.reset();
      setPaymentOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to record payment', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load invoice">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!invoice) return null;

  const paidSoFar = (invoice.payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(invoice.total) - paidSoFar;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/accounting" size="sm">
          ← All invoices
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>{invoice.invoiceNumber}</Title>
        <StatusMenu
          status={invoice.status}
          transitions={INVOICE_TRANSITIONS}
          colors={INVOICE_STATUS_COLORS}
          disabled={!canManage}
          loading={statusMutation.isPending}
          onChange={(status) => statusMutation.mutate(status)}
        />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            <Table.Td>{invoice.type}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>{invoice.type === 'PAYABLE' ? 'Vendor' : 'Customer'}</Table.Th>
            <Table.Td>{invoice.vendorId ?? invoice.customerName ?? '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Subtotal</Table.Th>
            <Table.Td>{Number(invoice.subtotal).toLocaleString()}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Tax</Table.Th>
            <Table.Td>{Number(invoice.tax).toLocaleString()}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Total</Table.Th>
            <Table.Td>{Number(invoice.total).toLocaleString()}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Remaining balance</Table.Th>
            <Table.Td>{remaining.toLocaleString()}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Group justify="space-between">
        <Title order={4}>Payments</Title>
        {canManage && invoice.status === 'APPROVED' && (
          <Button size="xs" onClick={() => setPaymentOpen(true)}>
            Record payment
          </Button>
        )}
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Amount</Table.Th>
            <Table.Th>Method</Table.Th>
            <Table.Th>Reference</Table.Th>
            <Table.Th>Recorded</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(invoice.payments ?? []).map((payment) => (
            <Table.Tr key={payment.id}>
              <Table.Td>{Number(payment.amount).toLocaleString()}</Table.Td>
              <Table.Td>{payment.method ?? '—'}</Table.Td>
              <Table.Td>{payment.reference ?? '—'}</Table.Td>
              <Table.Td>{new Date(payment.createdAt).toLocaleDateString()}</Table.Td>
            </Table.Tr>
          ))}
          {(invoice.payments ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>No payments recorded yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={paymentOpen} onClose={() => setPaymentOpen(false)} title="Record payment">
        <form noValidate onSubmit={paymentForm.onSubmit((values) => paymentMutation.mutate(values))}>
          <Stack>
            <NumberInput label="Amount" min={0} max={remaining} required {...paymentForm.getInputProps('amount')} />
            <TextInput label="Method" placeholder="Bank transfer" {...paymentForm.getInputProps('method')} />
            <TextInput label="Reference" {...paymentForm.getInputProps('reference')} />
            <Group justify="flex-end">
              <Button type="submit" loading={paymentMutation.isPending}>
                Record
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
