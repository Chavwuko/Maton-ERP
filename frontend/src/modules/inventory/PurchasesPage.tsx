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
import { deletePurchase, listPurchases, recordPurchase } from '../../api/inventory';
import { ApiError } from '../../api/client';
import { InventoryItemSelect } from '../../components/InventoryItemSelect';
import { VendorSelect } from '../../components/VendorSelect';
import { WarehouseSelect } from '../../components/WarehouseSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { formatDate, formatMoney, formatQty, todayIso } from './format';

export function PurchasesPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const canManage = hasRole(role, ['admin', 'inventory']);
  const isAdmin = hasRole(role, ['admin']);
  const showCosts = role !== 'staff';
  const columnCount = 6 + (showCosts ? 2 : 0) + (isAdmin ? 1 : 0);

  const {
    data: purchases,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['purchases', { from, to }],
    queryFn: () => listPurchases({ from: from || undefined, to: to || undefined }),
  });

  const form = useForm({
    initialValues: {
      itemId: '',
      warehouseId: '',
      vendorId: '',
      quantity: '' as number | string,
      unitCost: '' as number | string,
      date: todayIso(),
      poNumber: '',
      notes: '',
    },
    validate: {
      itemId: (value) => (value ? null : 'Item is required'),
      warehouseId: (value) => (value ? null : 'Warehouse is required'),
      vendorId: (value) => (value ? null : 'Supplier is required'),
      quantity: (value) => (value === '' || Number(value) <= 0 ? 'Quantity must be positive' : null),
      unitCost: (value) => (value === '' || Number(value) < 0 ? 'Unit cost is required' : null),
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
    queryClient.invalidateQueries({ queryKey: ['stock-overview'] });
    queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      recordPurchase({
        itemId: values.itemId,
        warehouseId: values.warehouseId,
        vendorId: values.vendorId,
        quantity: Number(values.quantity),
        unitCost: Number(values.unitCost),
        date: values.date || undefined,
        poNumber: values.poNumber || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Purchase recorded', color: 'green' });
      form.reset();
      setOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to record purchase', color: 'red' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePurchase(id),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Purchase deleted and stock reversed', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to delete purchase', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Purchases</Title>
        {canManage && <Button onClick={() => setOpen(true)}>Record purchase</Button>}
      </Group>

      <Group>
        <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load purchases">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {purchases && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>PO</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>Supplier</Table.Th>
              <Table.Th>Warehouse</Table.Th>
              <Table.Th>Quantity</Table.Th>
              {showCosts && <Table.Th>Unit cost</Table.Th>}
              {showCosts && <Table.Th>Total</Table.Th>}
              {isAdmin && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {purchases.map((purchase) => (
              <Table.Tr key={purchase.id}>
                <Table.Td>{formatDate(purchase.date)}</Table.Td>
                <Table.Td>{purchase.poNumber ?? '—'}</Table.Td>
                <Table.Td>{purchase.item ? `${purchase.item.sku} — ${purchase.item.name}` : purchase.itemId}</Table.Td>
                <Table.Td>{purchase.vendor?.name ?? '—'}</Table.Td>
                <Table.Td>{purchase.warehouse?.code ?? '—'}</Table.Td>
                <Table.Td>
                  {formatQty(purchase.quantity)} {purchase.item?.unitOfMeasure}
                </Table.Td>
                {showCosts && <Table.Td>{formatMoney(purchase.unitCost)}</Table.Td>}
                {showCosts && <Table.Td>{formatMoney(purchase.total)}</Table.Td>}
                {isAdmin && (
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Delete purchase ${purchase.poNumber ?? purchase.id}`}
                      onClick={() => {
                        if (window.confirm('Delete this purchase? Its stock will be reversed.')) {
                          deleteMutation.mutate(purchase.id);
                        }
                      }}
                    >
                      ✕
                    </ActionIcon>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {purchases.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columnCount}>No purchases yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Record purchase">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <InventoryItemSelect required {...form.getInputProps('itemId')} />
            <VendorSelect label="Supplier" required {...form.getInputProps('vendorId')} />
            <WarehouseSelect label="Receive into" required {...form.getInputProps('warehouseId')} />
            <Group grow>
              <NumberInput label="Quantity" min={0} decimalScale={3} required {...form.getInputProps('quantity')} />
              <NumberInput label="Unit cost" min={0} decimalScale={2} required {...form.getInputProps('unitCost')} />
            </Group>
            <Group grow>
              <TextInput type="date" label="Date" {...form.getInputProps('date')} />
              <TextInput label="PO number" {...form.getInputProps('poNumber')} />
            </Group>
            <Textarea label="Notes" {...form.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Record
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
