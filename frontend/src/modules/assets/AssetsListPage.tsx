import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Loader, Modal, Select, Stack, Switch, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createAsset, listAssets, listMyAssets } from '../../api/assets';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import {
  AssetFormFields,
  emptyAssetForm,
  formToFields,
  validateAssetForm,
  withoutBlanks,
  type AssetFormValues,
} from './AssetFormFields';
import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_COLORS,
  ASSET_STATUS_COLORS,
  holderName,
  type Asset,
  type AssetCondition,
  type AssetStatus,
} from './types';

const STATUSES: AssetStatus[] = ['ACTIVE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED'];

// "Assigned to me" comes from its own endpoint, so apply the same filters here.
function matches(asset: Asset, search: string, status: string | null, condition: string | null) {
  const needle = search.trim().toLowerCase();
  return (
    (!needle ||
      asset.assetTag.toLowerCase().includes(needle) ||
      asset.name.toLowerCase().includes(needle) ||
      (asset.serialNumber ?? '').toLowerCase().includes(needle)) &&
    (!status || asset.status === status) &&
    (!condition || asset.condition === condition)
  );
}

export function AssetsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [mine, setMine] = useState(false);

  const {
    data: assets,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assets', { mine, search, status, condition }],
    queryFn: async () => {
      if (mine) {
        return (await listMyAssets()).filter((asset) => matches(asset, search, status, condition));
      }
      return listAssets({
        search: search.trim() || undefined,
        status: (status as AssetStatus | null) ?? undefined,
        condition: (condition as AssetCondition | null) ?? undefined,
      });
    },
  });

  const form = useForm<AssetFormValues & { organizationId: string }>({
    initialValues: { organizationId: '', ...emptyAssetForm },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      ...validateAssetForm,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createAsset({
        organizationId: values.organizationId,
        assetTag: values.assetTag.trim(),
        name: values.name.trim(),
        category: values.category.trim(),
        ...withoutBlanks(formToFields(values)),
      }),
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

      <Group align="flex-end">
        <TextInput
          label="Search"
          placeholder="Tag, name or serial number"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Select
          label="Status"
          placeholder="All statuses"
          clearable
          data={STATUSES.map((value) => ({ value, label: value.replace('_', ' ') }))}
          value={status}
          onChange={setStatus}
        />
        <Select label="Condition" placeholder="Any condition" clearable data={ASSET_CONDITIONS} value={condition} onChange={setCondition} />
        <Switch label="Assigned to me" checked={mine} onChange={(event) => setMine(event.currentTarget.checked)} pb={6} />
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
              <Table.Th>Condition</Table.Th>
              <Table.Th>Held by</Table.Th>
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
                <Table.Td>
                  <Badge color={ASSET_CONDITION_COLORS[asset.condition]} variant="light">
                    {asset.condition}
                  </Badge>
                </Table.Td>
                <Table.Td>{holderName(asset.currentAssignment)}</Table.Td>
                <Table.Td>{asset.location ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
            {assets.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>{search || status || condition || mine ? 'No assets match.' : 'No assets yet.'}</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New asset" size="lg">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <AssetFormFields form={form as never} />
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
