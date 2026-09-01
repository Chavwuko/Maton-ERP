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
  Stack,
  Table,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createInventoryItem, listInventoryItems } from '../../api/inventory';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';

function onHand(item: { stockLevels?: { quantityOnHand: number }[] }): number {
  return (item.stockLevels ?? []).reduce((sum, level) => sum + level.quantityOnHand, 0);
}

export function InventoryItemsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'inventory']);

  const {
    data: items,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['inventory-items'], queryFn: () => listInventoryItems() });

  const form = useForm({
    initialValues: {
      organizationId: '',
      sku: '',
      name: '',
      unitOfMeasure: '',
      description: '',
      reorderPoint: '' as number | string,
      reorderQuantity: '' as number | string,
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      sku: (value) => (value.trim() ? null : 'SKU is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
      unitOfMeasure: (value) => (value.trim() ? null : 'Unit of measure is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createInventoryItem({
        organizationId: values.organizationId,
        sku: values.sku,
        name: values.name,
        unitOfMeasure: values.unitOfMeasure,
        description: values.description || undefined,
        reorderPoint: values.reorderPoint === '' ? undefined : Number(values.reorderPoint),
        reorderQuantity: values.reorderQuantity === '' ? undefined : Number(values.reorderQuantity),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      notifications.show({ message: 'Item created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create item', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Inventory Items</Title>
          <Anchor component={Link} to="/inventory/warehouses" size="sm">
            View warehouses →
          </Anchor>
        </div>
        {canManage && <Button onClick={() => setCreateOpen(true)}>New item</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load inventory items">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {items && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Unit</Table.Th>
              <Table.Th>On hand</Table.Th>
              <Table.Th>Reorder point</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => {
              const total = onHand(item);
              const low = item.reorderPoint != null && total < item.reorderPoint;
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/inventory/items/${item.id}`}>
                      {item.sku}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td>{item.unitOfMeasure}</Table.Td>
                  <Table.Td c={low ? 'red' : undefined} fw={low ? 600 : undefined}>
                    {total}
                  </Table.Td>
                  <Table.Td>{item.reorderPoint ?? '—'}</Table.Td>
                </Table.Tr>
              );
            })}
            {items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No inventory items yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New inventory item">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="SKU" placeholder="BRG-6205" required {...form.getInputProps('sku')} />
            <TextInput label="Name" placeholder="Bearing 6205" required {...form.getInputProps('name')} />
            <TextInput label="Unit of measure" placeholder="EA" required {...form.getInputProps('unitOfMeasure')} />
            <Textarea label="Description" {...form.getInputProps('description')} />
            <Group grow>
              <NumberInput label="Reorder point" min={0} {...form.getInputProps('reorderPoint')} />
              <NumberInput label="Reorder quantity" min={0} {...form.getInputProps('reorderQuantity')} />
            </Group>
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
