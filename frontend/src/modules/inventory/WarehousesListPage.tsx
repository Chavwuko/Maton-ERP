import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createWarehouse, listWarehouses } from '../../api/inventory';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';

export function WarehousesListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: warehouses,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['warehouses'], queryFn: () => listWarehouses() });

  const form = useForm({
    initialValues: { organizationId: '', code: '', name: '', location: '' },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      code: (value) => (value.trim() ? null : 'Code is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) => createWarehouse({ ...values, location: values.location || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      notifications.show({ message: 'Warehouse created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create warehouse', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Warehouses</Title>
          <Anchor component={Link} to="/inventory" size="sm">
            ← Inventory items
          </Anchor>
        </div>
        {hasRole(role, ['admin', 'inventory']) && <Button onClick={() => setCreateOpen(true)}>New warehouse</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load warehouses">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {warehouses && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Code</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Location</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {warehouses.map((wh) => (
              <Table.Tr key={wh.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/inventory/warehouses/${wh.id}`}>
                    {wh.code}
                  </Anchor>
                </Table.Td>
                <Table.Td>{wh.name}</Table.Td>
                <Table.Td>{wh.location ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
            {warehouses.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>No warehouses yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New warehouse">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Code" placeholder="WH-MAIN" required {...form.getInputProps('code')} />
            <TextInput label="Name" placeholder="Main Warehouse" required {...form.getInputProps('name')} />
            <TextInput label="Location" {...form.getInputProps('location')} />
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
