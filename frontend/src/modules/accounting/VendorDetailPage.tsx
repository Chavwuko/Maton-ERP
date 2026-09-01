import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Loader, Stack, Table, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getVendor } from '../../api/accounting';
import { StatusBadge } from '../../components/StatusBadge';
import { INVOICE_STATUS_COLORS } from './types';

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: vendor,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['vendors', id],
    queryFn: () => getVendor(id!),
    enabled: !!id,
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load vendor">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!vendor) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/accounting/vendors" size="sm">
          ← All vendors
        </Anchor>
      </div>

      <Title order={2}>{vendor.name}</Title>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Email</Table.Th>
            <Table.Td>{vendor.contactEmail ?? '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Phone</Table.Th>
            <Table.Td>{vendor.contactPhone ?? '—'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Title order={4}>Invoices</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Number</Table.Th>
            <Table.Th>Total</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(vendor.invoices ?? []).map((invoice) => (
            <Table.Tr key={invoice.id}>
              <Table.Td>
                <Anchor component={Link} to={`/accounting/invoices/${invoice.id}`}>
                  {invoice.invoiceNumber}
                </Anchor>
              </Table.Td>
              <Table.Td>{Number(invoice.total).toLocaleString()}</Table.Td>
              <Table.Td>
                <StatusBadge status={invoice.status} colors={INVOICE_STATUS_COLORS} />
              </Table.Td>
            </Table.Tr>
          ))}
          {(vendor.invoices ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>No invoices yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
