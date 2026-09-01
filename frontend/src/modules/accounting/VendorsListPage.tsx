import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createVendor, listVendors } from '../../api/accounting';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';

export function VendorsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: vendors,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['vendors'], queryFn: () => listVendors() });

  const form = useForm({
    initialValues: { organizationId: '', name: '', contactEmail: '', contactPhone: '' },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createVendor({
        ...values,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      notifications.show({ message: 'Vendor created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create vendor', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Vendors</Title>
          <Anchor component={Link} to="/accounting" size="sm">
            ← Invoices
          </Anchor>
        </div>
        {hasRole(role, ['admin', 'finance']) && <Button onClick={() => setCreateOpen(true)}>New vendor</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load vendors">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {vendors && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Phone</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {vendors.map((vendor) => (
              <Table.Tr key={vendor.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/accounting/vendors/${vendor.id}`}>
                    {vendor.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>{vendor.contactEmail ?? '—'}</Table.Td>
                <Table.Td>{vendor.contactPhone ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
            {vendors.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>No vendors yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New vendor">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Name" placeholder="Acme Supplies" required {...form.getInputProps('name')} />
            <TextInput label="Contact email" {...form.getInputProps('contactEmail')} />
            <TextInput label="Contact phone" {...form.getInputProps('contactPhone')} />
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
