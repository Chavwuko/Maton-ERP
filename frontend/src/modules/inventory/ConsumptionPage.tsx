import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
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
import { deleteConsumption, listConsumptions, recordConsumption } from '../../api/inventory';
import { ApiError } from '../../api/client';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import { InventoryItemSelect } from '../../components/InventoryItemSelect';
import { ProjectSelect } from '../../components/ProjectSelect';
import { WarehouseSelect } from '../../components/WarehouseSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { formatDate, formatMoney, formatQty, todayIso } from './format';

export function ConsumptionPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const canManage = hasRole(role, ['admin', 'inventory']);
  const isAdmin = hasRole(role, ['admin']);

  const {
    data: consumptions,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['consumptions', { from, to }],
    queryFn: () => listConsumptions({ from: from || undefined, to: to || undefined }),
  });

  const form = useForm({
    initialValues: {
      itemId: '',
      warehouseId: '',
      quantity: '' as number | string,
      departmentId: '',
      projectId: '',
      issuedTo: '',
      purpose: '',
      date: todayIso(),
    },
    validate: {
      itemId: (value) => (value ? null : 'Item is required'),
      warehouseId: (value) => (value ? null : 'Warehouse is required'),
      quantity: (value) => (value === '' || Number(value) <= 0 ? 'Quantity must be positive' : null),
      departmentId: (value, values) => (!value && !values.projectId ? 'Charge to a department or a project' : null),
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['consumptions'] });
    queryClient.invalidateQueries({ queryKey: ['stock-overview'] });
    queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      recordConsumption({
        itemId: values.itemId,
        warehouseId: values.warehouseId,
        quantity: Number(values.quantity),
        departmentId: values.departmentId || undefined,
        projectId: values.projectId || undefined,
        issuedTo: values.issuedTo || undefined,
        purpose: values.purpose || undefined,
        date: values.date || undefined,
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Stock issued', color: 'green' });
      form.reset();
      setOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to issue stock', color: 'red' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConsumption(id),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Issue deleted and stock returned', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to delete issue', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Consumption</Title>
        {canManage && <Button onClick={() => setOpen(true)}>Issue stock</Button>}
      </Group>

      <Group>
        <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load consumption">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {consumptions && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>Quantity</Table.Th>
              <Table.Th>Department</Table.Th>
              <Table.Th>Project</Table.Th>
              <Table.Th>Issued to</Table.Th>
              <Table.Th>Purpose</Table.Th>
              <Table.Th>Cost</Table.Th>
              {isAdmin && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {consumptions.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{formatDate(row.date)}</Table.Td>
                <Table.Td>{row.item ? `${row.item.sku} — ${row.item.name}` : row.itemId}</Table.Td>
                <Table.Td>
                  {formatQty(row.quantity)} {row.item?.unitOfMeasure}
                </Table.Td>
                <Table.Td>{row.department?.name ?? '—'}</Table.Td>
                <Table.Td>{row.project ? `${row.project.code} — ${row.project.name}` : '—'}</Table.Td>
                <Table.Td>{row.issuedTo ?? '—'}</Table.Td>
                <Table.Td>{row.purpose ?? '—'}</Table.Td>
                <Table.Td>{formatMoney(row.total)}</Table.Td>
                {isAdmin && (
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Delete issue ${row.id}`}
                      onClick={() => {
                        if (window.confirm('Delete this issue? The stock will be returned.')) {
                          deleteMutation.mutate(row.id);
                        }
                      }}
                    >
                      ✕
                    </ActionIcon>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {consumptions.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={isAdmin ? 9 : 8}>No stock issued yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Issue stock">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <InventoryItemSelect required {...form.getInputProps('itemId')} />
            <WarehouseSelect label="Issue from" required {...form.getInputProps('warehouseId')} />
            <NumberInput label="Quantity" min={0} decimalScale={3} required {...form.getInputProps('quantity')} />
            <DepartmentSelect description="Charge to a department and/or a project" {...form.getInputProps('departmentId')} />
            <ProjectSelect {...form.getInputProps('projectId')} />
            <TextInput label="Issued to" placeholder="Person collecting" {...form.getInputProps('issuedTo')} />
            <Textarea label="Purpose" {...form.getInputProps('purpose')} />
            <TextInput type="date" label="Date" {...form.getInputProps('date')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Issue
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
