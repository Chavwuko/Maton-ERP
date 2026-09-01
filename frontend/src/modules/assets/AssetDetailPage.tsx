import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Group, Loader, Stack, Table, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getAsset } from '../../api/assets';
import { StatusBadge } from '../../components/StatusBadge';
import { WORK_ORDER_STATUS_COLORS } from '../maintenance/types';
import { ASSET_STATUS_COLORS } from './types';

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: asset,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assets', id],
    queryFn: () => getAsset(id!),
    enabled: !!id,
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load asset">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!asset) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/assets" size="sm">
          ← All assets
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>
          {asset.assetTag} — {asset.name}
        </Title>
        <StatusBadge status={asset.status} colors={ASSET_STATUS_COLORS} />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Td>{asset.category}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Location</Table.Th>
            <Table.Td>{asset.location ?? '—'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Title order={4}>Work orders</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Priority</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Updated</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(asset.workOrders ?? []).map((wo) => (
            <Table.Tr key={wo.id}>
              <Table.Td>
                <Anchor component={Link} to={`/maintenance/${wo.id}`}>
                  {wo.title}
                </Anchor>
              </Table.Td>
              <Table.Td>{wo.priority}</Table.Td>
              <Table.Td>
                <StatusBadge status={wo.status} colors={WORK_ORDER_STATUS_COLORS} />
              </Table.Td>
              <Table.Td>{new Date(wo.updatedAt).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
          {(asset.workOrders ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>No work orders yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
