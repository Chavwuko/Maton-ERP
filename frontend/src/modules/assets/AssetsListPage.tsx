import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createAsset, listAssets } from '../../api/assets';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { ASSET_STATUS_COLORS } from './types';

export function AssetsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: assets,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['assets'], queryFn: () => listAssets() });

  const form = useForm({
    initialValues: { organizationId: '', assetTag: '', name: '', category: '', location: '' },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      assetTag: (value) => (value.trim() ? null : 'Asset tag is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
      category: (value) => (value.trim() ? null : 'Category is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createAsset({ ...values, location: values.location || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      notifications.show({ message: 'Asset created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create asset', color: 'red' });
    },
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Assets</Title>
        {hasRole(role, ['admin', 'maintenance']) && <Button onClick={() => setCreateOpen(true)}>New asset</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load assets">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {assets && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tag</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Location</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {assets.map((asset) => (
              <Table.Tr key={asset.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/assets/${asset.id}`}>
                    {asset.assetTag}
                  </Anchor>
                </Table.Td>
                <Table.Td>{asset.name}</Table.Td>
                <Table.Td>{asset.category}</Table.Td>
                <Table.Td>
                  <StatusBadge status={asset.status} colors={ASSET_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{asset.location ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
            {assets.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No assets yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New asset">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Asset tag" placeholder="PUMP-001" required {...form.getInputProps('assetTag')} />
            <TextInput label="Name" placeholder="Centrifugal Pump" required {...form.getInputProps('name')} />
            <TextInput label="Category" placeholder="Rotating equipment" required {...form.getInputProps('category')} />
            <TextInput label="Location" placeholder="Plant 1 / Bay 3" {...form.getInputProps('location')} />
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
