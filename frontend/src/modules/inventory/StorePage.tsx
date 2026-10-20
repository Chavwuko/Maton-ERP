import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { adjustStock, getStockOverview, listStockTransactions } from '../../api/inventory';
import { ApiError } from '../../api/client';
import { InventoryItemSelect } from '../../components/InventoryItemSelect';
import { WarehouseSelect } from '../../components/WarehouseSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { formatDate, formatMoney, formatQty } from './format';
import {
  STOCK_STATUS_COLORS,
  STOCK_STATUS_LABELS,
  STOCK_TRANSACTION_TYPE_COLORS,
  type StockOverviewRow,
  type StockTransactionType,
} from './types';

const LEDGER_TYPES: StockTransactionType[] = ['OPENING', 'RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER', 'REVERSAL'];

function AvailableStock() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState<StockOverviewRow | null>(null);
  const canManage = hasRole(role, ['admin', 'inventory']);

  const {
    data: items,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['stock-overview'], queryFn: () => getStockOverview() });

  const form = useForm({
    initialValues: { warehouseId: '', countedQuantity: '' as number | string, reason: '' },
    validate: {
      warehouseId: (value) => (value ? null : 'Warehouse is required'),
      countedQuantity: (value) => (value === '' || Number(value) < 0 ? 'Counted quantity is required' : null),
      reason: (value) => (value.trim() ? null : 'A reason is required'),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      adjustStock({
        itemId: adjusting!.id,
        warehouseId: values.warehouseId,
        countedQuantity: Number(values.countedQuantity),
        reason: values.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-overview'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      notifications.show({ message: 'Stock count recorded', color: 'green' });
      form.reset();
      setAdjusting(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to record stock count', color: 'red' }),
  });

  const totalValue = (items ?? []).reduce((sum, item) => sum + Number(item.stockValue), 0);

  return (
    <Stack>
      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load stock">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {items && (
        <>
          <Text size="sm">
            {items.length} item{items.length === 1 ? '' : 's'} · stock value <b>{formatMoney(totalValue)}</b>
          </Text>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>On hand</Table.Th>
                <Table.Th>Reorder point</Table.Th>
                <Table.Th>Value</Table.Th>
                <Table.Th>Status</Table.Th>
                {canManage && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/inventory/items/${item.id}`}>
                      {item.sku} — {item.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    {formatQty(item.totalOnHand)} {item.unitOfMeasure}
                  </Table.Td>
                  <Table.Td>{item.reorderPoint ?? '—'}</Table.Td>
                  <Table.Td>{formatMoney(item.stockValue)}</Table.Td>
                  <Table.Td>
                    <Badge color={STOCK_STATUS_COLORS[item.status]} variant="light">
                      {STOCK_STATUS_LABELS[item.status]}
                    </Badge>
                  </Table.Td>
                  {canManage && (
                    <Table.Td>
                      <Button size="compact-xs" variant="light" onClick={() => setAdjusting(item)}>
                        Stock take
                      </Button>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
              {items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={canManage ? 6 : 5}>No stock yet.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </>
      )}

      <Modal opened={!!adjusting} onClose={() => setAdjusting(null)} title={`Stock take — ${adjusting?.sku ?? ''}`}>
        <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
          <Stack>
            <WarehouseSelect required {...form.getInputProps('warehouseId')} />
            <NumberInput
              label="Counted quantity"
              description="What is physically on the shelf; the difference is posted as an adjustment"
              min={0}
              decimalScale={3}
              required
              {...form.getInputProps('countedQuantity')}
            />
            <Textarea label="Reason" required {...form.getInputProps('reason')} />
            <Group justify="flex-end">
              <Button type="submit" loading={mutation.isPending}>
                Record count
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function Ledger() {
  const [itemId, setItemId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const {
    data: transactions,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['stock-transactions', { itemId, type, from, to }],
    queryFn: () =>
      listStockTransactions({
        itemId: itemId ?? undefined,
        type: (type as StockTransactionType | null) ?? undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  return (
    <Stack>
      <Group align="flex-end">
        <InventoryItemSelect label="Item" clearable value={itemId} onChange={setItemId} />
        <Select label="Type" placeholder="All types" clearable data={LEDGER_TYPES} value={type} onChange={setType} />
        <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load the ledger">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {transactions && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>Warehouse</Table.Th>
              <Table.Th>Quantity</Table.Th>
              <Table.Th>Balance after</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {transactions.map((txn) => (
              <Table.Tr key={txn.id}>
                <Table.Td>{formatDate(txn.createdAt)}</Table.Td>
                <Table.Td>
                  <Badge color={STOCK_TRANSACTION_TYPE_COLORS[txn.type]} variant="light">
                    {txn.type}
                  </Badge>
                </Table.Td>
                <Table.Td>{txn.item ? `${txn.item.sku} — ${txn.item.name}` : txn.itemId}</Table.Td>
                <Table.Td>{txn.warehouse?.code ?? '—'}</Table.Td>
                <Table.Td>{formatQty(txn.quantity)}</Table.Td>
                <Table.Td>{txn.balanceAfter == null ? '—' : formatQty(txn.balanceAfter)}</Table.Td>
                <Table.Td>{txn.notes ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
            {transactions.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>No movements match.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

export function StorePage() {
  return (
    <Stack>
      <Title order={2}>Store</Title>

      <Tabs defaultValue="available">
        <Tabs.List>
          <Tabs.Tab value="available">Available stock</Tabs.Tab>
          <Tabs.Tab value="ledger">Ledger</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="available" pt="md">
          <AvailableStock />
        </Tabs.Panel>
        <Tabs.Panel value="ledger" pt="md">
          <Ledger />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
