import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createInvoice, listInvoices } from '../../api/accounting';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { VendorSelect } from '../../components/VendorSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { INVOICE_STATUS_COLORS, type InvoiceType } from './types';

export function InvoicesListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'finance']);

  const {
    data: invoices,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['invoices'], queryFn: () => listInvoices() });

  const form = useForm({
    initialValues: {
      organizationId: '',
      type: 'PAYABLE' as InvoiceType,
      invoiceNumber: '',
      subtotal: '' as number | string,
      tax: '' as number | string,
      vendorId: '',
      customerName: '',
      dueDate: '',
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      invoiceNumber: (value) => (value.trim() ? null : 'Invoice number is required'),
      subtotal: (value) => (value === '' ? 'Subtotal is required' : null),
      vendorId: (value, values) => (values.type === 'PAYABLE' && !value ? 'Vendor is required for a payable invoice' : null),
      customerName: (value, values) =>
        values.type === 'RECEIVABLE' && !value.trim() ? 'Customer name is required for a receivable invoice' : null,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createInvoice({
        organizationId: values.organizationId,
        type: values.type,
        invoiceNumber: values.invoiceNumber,
        subtotal: Number(values.subtotal),
        tax: values.tax === '' ? undefined : Number(values.tax),
        vendorId: values.type === 'PAYABLE' ? values.vendorId : undefined,
        customerName: values.type === 'RECEIVABLE' ? values.customerName : undefined,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      notifications.show({ message: 'Invoice created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create invoice', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Invoices</Title>
          <Anchor component={Link} to="/accounting/vendors" size="sm">
            View vendors →
          </Anchor>
        </div>
        {canManage && <Button onClick={() => setCreateOpen(true)}>New invoice</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load invoices">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {invoices && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Number</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Due</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {invoices.map((invoice) => (
              <Table.Tr key={invoice.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/accounting/invoices/${invoice.id}`}>
                    {invoice.invoiceNumber}
                  </Anchor>
                </Table.Td>
                <Table.Td>{invoice.type}</Table.Td>
                <Table.Td>{Number(invoice.total).toLocaleString()}</Table.Td>
                <Table.Td>
                  <StatusBadge status={invoice.status} colors={INVOICE_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</Table.Td>
              </Table.Tr>
            ))}
            {invoices.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No invoices yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New invoice">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <Select
              label="Type"
              data={['PAYABLE', 'RECEIVABLE']}
              allowDeselect={false}
              {...form.getInputProps('type')}
            />
            <TextInput label="Invoice number" placeholder="INV-1001" required {...form.getInputProps('invoiceNumber')} />
            {form.values.type === 'PAYABLE' ? (
              <VendorSelect required {...form.getInputProps('vendorId')} />
            ) : (
              <TextInput label="Customer name" required {...form.getInputProps('customerName')} />
            )}
            <Group grow>
              <NumberInput label="Subtotal" min={0} required {...form.getInputProps('subtotal')} />
              <NumberInput label="Tax" min={0} {...form.getInputProps('tax')} />
            </Group>
            <TextInput type="date" label="Due date" {...form.getInputProps('dueDate')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
