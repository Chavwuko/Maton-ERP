import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Loader, Stack, Table, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getWarehouse } from '../../api/inventory';

export function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: warehouse,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => getWarehouse(id!),
    enabled: !!id,
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load warehouse">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!warehouse) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/inventory/warehouses" size="sm">
          ← All warehouses
        </Anchor>
      </div>

      <Title order={2}>
        {warehouse.code} — {warehouse.name}
      </Title>
      <div>Location: {warehouse.location ?? '—'}</div>

      <Title order={4}>Stock</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>SKU</Table.Th>
            <Table.Th>Item</Table.Th>
            <Table.Th>On hand</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {warehouse.stockLevels.map((level) => (
            <Table.Tr key={level.id}>
              <Table.Td>
                {level.item ? (
                  <Anchor component={Link} to={`/inventory/items/${level.itemId}`}>
                    {level.item.sku}
                  </Anchor>
                ) : (
                  level.itemId
                )}
              </Table.Td>
              <Table.Td>{level.item?.name ?? '—'}</Table.Td>
              <Table.Td>{level.quantityOnHand}</Table.Td>
            </Table.Tr>
          ))}
          {warehouse.stockLevels.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>No stock recorded yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
