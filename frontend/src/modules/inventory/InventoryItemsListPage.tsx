import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
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
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  createInventoryItem,
  createItemCategory,
  deleteInventoryItem,
  getStockOverview,
  listItemCategories,
  updateInventoryItem,
} from '../../api/inventory';
import { ApiError } from '../../api/client';
import { ItemCategorySelect } from '../../components/ItemCategorySelect';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { WarehouseSelect } from '../../components/WarehouseSelect';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { formatMoney, formatQty } from './format';
import {
  STOCK_STATUS_COLORS,
  STOCK_STATUS_LABELS,
  UNITS_OF_MEASURE,
  type StockOverviewRow,
  type StockStatus,
} from './types';

const numOrUndefined = (value: number | string) => (value === '' ? undefined : Number(value));

export function InventoryItemsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editing, setEditing] = useState<StockOverviewRow | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const canManage = hasRole(role, ['admin', 'inventory']);
  const isAdmin = hasRole(role, ['admin']);

  const {
    data: items,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['stock-overview'], queryFn: () => getStockOverview() });

  const { data: categories } = useQuery({ queryKey: ['item-categories'], queryFn: () => listItemCategories() });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (items ?? []).filter(
      (item) =>
        (!needle || item.sku.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)) &&
        (!categoryFilter || item.categoryId === categoryFilter) &&
        (!statusFilter || item.status === statusFilter),
    );
  }, [items, search, categoryFilter, statusFilter]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-overview'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
  };

  const createForm = useForm({
    initialValues: {
      organizationId: '',
      sku: '',
      name: '',
      unitOfMeasure: '',
      categoryId: '',
      location: '',
      description: '',
      unitCost: '' as number | string,
      reorderPoint: '' as number | string,
      reorderQuantity: '' as number | string,
      openingStock: '' as number | string,
      openingWarehouseId: '',
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      sku: (value) => (value.trim() ? null : 'SKU is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
      unitOfMeasure: (value) => (value.trim() ? null : 'Unit of measure is required'),
      openingWarehouseId: (value, values) =>
        Number(values.openingStock) > 0 && !value ? 'Warehouse is required for opening stock' : null,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof createForm.values) =>
      createInventoryItem({
        organizationId: values.organizationId,
        sku: values.sku,
        name: values.name,
        unitOfMeasure: values.unitOfMeasure,
        description: values.description || undefined,
        categoryId: values.categoryId || undefined,
        location: values.location || undefined,
        unitCost: numOrUndefined(values.unitCost),
        reorderPoint: numOrUndefined(values.reorderPoint),
        reorderQuantity: numOrUndefined(values.reorderQuantity),
        openingStock: numOrUndefined(values.openingStock),
        openingWarehouseId: Number(values.openingStock) > 0 ? values.openingWarehouseId : undefined,
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Item created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create item', color: 'red' }),
  });

  const editForm = useForm({
    initialValues: {
      sku: '',
      name: '',
      unitOfMeasure: '',
      categoryId: '',
      location: '',
      description: '',
      reorderPoint: '' as number | string,
      reorderQuantity: '' as number | string,
    },
    validate: {
      sku: (value) => (value.trim() ? null : 'SKU is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
      unitOfMeasure: (value) => (value.trim() ? null : 'Unit of measure is required'),
    },
  });

  const openEdit = (item: StockOverviewRow) => {
    editForm.setValues({
      sku: item.sku,
      name: item.name,
      unitOfMeasure: item.unitOfMeasure,
      categoryId: item.categoryId ?? '',
      location: item.location ?? '',
      description: item.description ?? '',
      reorderPoint: item.reorderPoint ?? '',
      reorderQuantity: item.reorderQuantity ?? '',
    });
    setEditing(item);
  };

  const editMutation = useMutation({
    mutationFn: (values: typeof editForm.values) =>
      updateInventoryItem(editing!.id, {
        sku: values.sku,
        name: values.name,
        unitOfMeasure: values.unitOfMeasure,
        categoryId: values.categoryId || undefined,
        location: values.location || undefined,
        description: values.description || undefined,
        reorderPoint: numOrUndefined(values.reorderPoint),
        reorderQuantity: numOrUndefined(values.reorderQuantity),
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Item updated', color: 'green' });
      setEditing(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update item', color: 'red' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInventoryItem(id),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Item deleted', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to delete item', color: 'red' }),
  });

  const categoryForm = useForm({
    initialValues: { organizationId: '', name: '' },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const categoryMutation = useMutation({
    mutationFn: (values: typeof categoryForm.values) => createItemCategory(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-categories'] });
      notifications.show({ message: 'Category added', color: 'green' });
      categoryForm.setFieldValue('name', '');
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to add category', color: 'red' }),
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
        {canManage && (
          <Group>
            <Button variant="light" onClick={() => setCategoriesOpen(true)}>
              Categories
            </Button>
            <Button onClick={() => setCreateOpen(true)}>New item</Button>
          </Group>
        )}
      </Group>

      <Group>
        <TextInput
          placeholder="Search SKU or name"
          aria-label="Search items"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Select
          placeholder="All categories"
          aria-label="Filter by category"
          clearable
          data={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <Select
          placeholder="All statuses"
          aria-label="Filter by status"
          clearable
          data={(Object.keys(STOCK_STATUS_LABELS) as StockStatus[]).map((status) => ({
            value: status,
            label: STOCK_STATUS_LABELS[status],
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
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
              <Table.Th>Category</Table.Th>
              <Table.Th>Unit</Table.Th>
              <Table.Th>Location</Table.Th>
              <Table.Th>On hand</Table.Th>
              <Table.Th>Unit cost</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th>Status</Table.Th>
              {canManage && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visible.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/inventory/items/${item.id}`}>
                    {item.sku}
                  </Anchor>
                </Table.Td>
                <Table.Td>{item.name}</Table.Td>
                <Table.Td>{item.category?.name ?? '—'}</Table.Td>
                <Table.Td>{item.unitOfMeasure}</Table.Td>
                <Table.Td>{item.location ?? '—'}</Table.Td>
                <Table.Td>{formatQty(item.totalOnHand)}</Table.Td>
                <Table.Td>{formatMoney(item.unitCost)}</Table.Td>
                <Table.Td>{formatMoney(item.stockValue)}</Table.Td>
                <Table.Td>
                  <Badge color={STOCK_STATUS_COLORS[item.status]} variant="light">
                    {STOCK_STATUS_LABELS[item.status]}
                  </Badge>
                </Table.Td>
                {canManage && (
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" onClick={() => openEdit(item)}>
                        Edit
                      </Button>
                      {isAdmin && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Delete ${item.sku}`}
                          loading={deleteMutation.isPending && deleteMutation.variables === item.id}
                          onClick={() => {
                            if (window.confirm(`Delete ${item.sku} — ${item.name}?`)) deleteMutation.mutate(item.id);
                          }}
                        >
                          ✕
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={canManage ? 10 : 9}>No inventory items yet.</Table.Td>
              </Table.Tr>
            )}
            {items.length > 0 && visible.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={canManage ? 10 : 9}>No items match the current filters.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New inventory item">
        <form noValidate onSubmit={createForm.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...createForm.getInputProps('organizationId')} />
            <TextInput label="SKU" placeholder="BRG-6205" required {...createForm.getInputProps('sku')} />
            <TextInput label="Name" placeholder="Bearing 6205" required {...createForm.getInputProps('name')} />
            <Group grow align="flex-start">
              <Select
                label="Unit of measure"
                placeholder="Select unit"
                searchable
                required
                data={UNITS_OF_MEASURE}
                {...createForm.getInputProps('unitOfMeasure')}
              />
              <ItemCategorySelect {...createForm.getInputProps('categoryId')} />
            </Group>
            <TextInput label="Location" placeholder="Shelf A3" {...createForm.getInputProps('location')} />
            <NumberInput
              label="Unit cost"
              description="Starting cost; purchases keep it as a weighted average"
              min={0}
              decimalScale={2}
              {...createForm.getInputProps('unitCost')}
            />
            <Group grow>
              <NumberInput label="Reorder point" min={0} {...createForm.getInputProps('reorderPoint')} />
              <NumberInput label="Reorder quantity" min={0} {...createForm.getInputProps('reorderQuantity')} />
            </Group>
            <Group grow align="flex-start">
              <NumberInput
                label="Opening stock"
                min={0}
                decimalScale={3}
                {...createForm.getInputProps('openingStock')}
              />
              <WarehouseSelect
                label="Opening warehouse"
                clearable
                {...createForm.getInputProps('openingWarehouseId')}
              />
            </Group>
            <Textarea label="Description" {...createForm.getInputProps('description')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.sku ?? ''}`}>
        <form noValidate onSubmit={editForm.onSubmit((values) => editMutation.mutate(values))}>
          <Stack>
            <TextInput label="SKU" required {...editForm.getInputProps('sku')} />
            <TextInput label="Name" required {...editForm.getInputProps('name')} />
            <Group grow align="flex-start">
              <Select
                label="Unit of measure"
                searchable
                required
                data={UNITS_OF_MEASURE.includes(editForm.values.unitOfMeasure) ? UNITS_OF_MEASURE : [...UNITS_OF_MEASURE, editForm.values.unitOfMeasure]}
                {...editForm.getInputProps('unitOfMeasure')}
              />
              <ItemCategorySelect {...editForm.getInputProps('categoryId')} />
            </Group>
            <TextInput label="Location" {...editForm.getInputProps('location')} />
            <Group grow>
              <NumberInput label="Reorder point" min={0} {...editForm.getInputProps('reorderPoint')} />
              <NumberInput label="Reorder quantity" min={0} {...editForm.getInputProps('reorderQuantity')} />
            </Group>
            <Textarea label="Description" {...editForm.getInputProps('description')} />
            <Group justify="flex-end">
              <Button type="submit" loading={editMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={categoriesOpen} onClose={() => setCategoriesOpen(false)} title="Item categories">
        <Stack>
          {(categories ?? []).length === 0 ? (
            <Text size="sm">No categories yet.</Text>
          ) : (
            <Group gap="xs">
              {(categories ?? []).map((category) => (
                <Badge key={category.id} variant="light">
                  {category.name}
                </Badge>
              ))}
            </Group>
          )}
          <form noValidate onSubmit={categoryForm.onSubmit((values) => categoryMutation.mutate(values))}>
            <Stack>
              <OrganizationSelect required {...categoryForm.getInputProps('organizationId')} />
              <TextInput label="New category" required {...categoryForm.getInputProps('name')} />
              <Group justify="flex-end">
                <Button type="submit" loading={categoryMutation.isPending}>
                  Add category
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Modal>
    </Stack>
  );
}
