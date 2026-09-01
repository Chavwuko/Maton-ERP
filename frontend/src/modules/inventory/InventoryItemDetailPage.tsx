import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, NumberInput, Select, Stack, Table, Textarea, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getInventoryItem, listStockTransactions, recordStockTransaction, transferStock } from '../../api/inventory';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { WarehouseSelect } from '../../components/WarehouseSelect';
import type { CreatableStockTransactionType } from './types';

export function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [txnOpen, setTxnOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'inventory']);

  const {
    data: item,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['inventory-items', id],
    queryFn: () => getInventoryItem(id!),
    enabled: !!id,
  });

  const { data: transactions } = useQuery({
    queryKey: ['stock-transactions', { itemId: id }],
    queryFn: () => listStockTransactions({ itemId: id }),
    enabled: !!id,
  });

  const txnForm = useForm({
    initialValues: { warehouseId: '', type: 'RECEIPT' as CreatableStockTransactionType, quantity: '' as number | string, notes: '' },
    validate: {
      warehouseId: (value) => (value ? null : 'Warehouse is required'),
      quantity: (value) => (value === '' || Number(value) === 0 ? 'Quantity is required' : null),
    },
  });

  const transferForm = useForm({
    initialValues: { fromWarehouseId: '', toWarehouseId: '', quantity: '' as number | string, notes: '' },
    validate: {
      fromWarehouseId: (value) => (value ? null : 'Source warehouse is required'),
      toWarehouseId: (value, values) =>
        !value ? 'Destination warehouse is required' : value === values.fromWarehouseId ? 'Must differ from source' : null,
      quantity: (value) => (value === '' || Number(value) <= 0 ? 'Quantity must be positive' : null),
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory-items', id] });
    queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
  };

  const txnMutation = useMutation({
    mutationFn: (values: typeof txnForm.values) =>
      recordStockTransaction({
        itemId: id!,
        warehouseId: values.warehouseId,
        type: values.type,
        quantity: Number(values.quantity),
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Transaction recorded', color: 'green' });
      txnForm.reset();
      setTxnOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to record transaction', color: 'red' }),
  });

  const transferMutation = useMutation({
    mutationFn: (values: typeof transferForm.values) =>
      transferStock({
        itemId: id!,
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        quantity: Number(values.quantity),
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Stock transferred', color: 'green' });
      transferForm.reset();
      setTransferOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to transfer stock', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load item">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!item) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/inventory" size="sm">
          ← All inventory items
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>
          {item.sku} — {item.name}
        </Title>
        {canManage && (
          <Group>
            <Button variant="light" size="xs" onClick={() => setTransferOpen(true)}>
              Transfer stock
            </Button>
            <Button size="xs" onClick={() => setTxnOpen(true)}>
              Record transaction
            </Button>
          </Group>
        )}
      </Group>

      <Title order={4}>Stock by warehouse</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Warehouse</Table.Th>
            <Table.Th>On hand</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(item.stockLevels ?? []).map((level) => (
            <Table.Tr key={level.id}>
              <Table.Td>{level.warehouse ? `${level.warehouse.code} — ${level.warehouse.name}` : level.warehouseId}</Table.Td>
              <Table.Td>{level.quantityOnHand}</Table.Td>
            </Table.Tr>
          ))}
          {(item.stockLevels ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={2}>No stock recorded yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Title order={4}>Recent transactions</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            <Table.Th>Quantity</Table.Th>
            <Table.Th>Notes</Table.Th>
            <Table.Th>Date</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(transactions ?? []).map((txn) => (
            <Table.Tr key={txn.id}>
              <Table.Td>{txn.type}</Table.Td>
              <Table.Td>{txn.quantity}</Table.Td>
              <Table.Td>{txn.notes ?? '—'}</Table.Td>
              <Table.Td>{new Date(txn.createdAt).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
          {(transactions ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>No transactions yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={txnOpen} onClose={() => setTxnOpen(false)} title="Record transaction">
        <form noValidate onSubmit={txnForm.onSubmit((values) => txnMutation.mutate(values))}>
          <Stack>
            <WarehouseSelect required {...txnForm.getInputProps('warehouseId')} />
            <Select
              label="Type"
              data={['RECEIPT', 'ISSUE', 'ADJUSTMENT']}
              allowDeselect={false}
              {...txnForm.getInputProps('type')}
            />
            <NumberInput
              label="Quantity"
              description={txnForm.values.type === 'ADJUSTMENT' ? 'Signed delta (can be negative)' : 'Positive count'}
              required
              {...txnForm.getInputProps('quantity')}
            />
            <Textarea label="Notes" {...txnForm.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button type="submit" loading={txnMutation.isPending}>
                Record
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer stock">
        <form noValidate onSubmit={transferForm.onSubmit((values) => transferMutation.mutate(values))}>
          <Stack>
            <WarehouseSelect label="From warehouse" required {...transferForm.getInputProps('fromWarehouseId')} />
            <WarehouseSelect label="To warehouse" required {...transferForm.getInputProps('toWarehouseId')} />
            <NumberInput label="Quantity" min={0} required {...transferForm.getInputProps('quantity')} />
            <Textarea label="Notes" {...transferForm.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button type="submit" loading={transferMutation.isPending}>
                Transfer
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
