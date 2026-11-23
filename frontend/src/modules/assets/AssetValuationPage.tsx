import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Loader, SimpleGrid, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { downloadValuationExport, getValuationReport } from '../../api/assets';
import { saveTextFile } from '../../lib/saveFile';
import { useRole } from '../../auth/RoleContext';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { formatMoney } from '../inventory/format';
import { ASSET_STATUS_COLORS, DEPRECIATION_METHODS } from './types';

const methodLabel = (method: string) => DEPRECIATION_METHODS.find((entry) => entry.value === method)?.label ?? method;
const money = (value: string | null) => (value === null ? '—' : formatMoney(value));

// What the whole register is worth on the books on a chosen day, by category
// and asset. Money, so the staff role does not get it.
export function AssetValuationPage() {
  const { role } = useRole();
  const allowed = role !== 'staff';
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [asOf, setAsOf] = useState('');
  const [includeDecommissioned, setIncludeDecommissioned] = useState(false);

  const {
    data: report,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assets', 'valuation', { organizationId, asOf, includeDecommissioned }],
    queryFn: () => getValuationReport({ organizationId: organizationId ?? undefined, asOf: asOf || undefined, includeDecommissioned }),
    enabled: allowed,
  });

  const exportMutation = useMutation({
    mutationFn: () => downloadValuationExport({ organizationId: organizationId ?? undefined, asOf: asOf || undefined, includeDecommissioned }),
    onSuccess: ({ filename, text }) => saveTextFile(filename, text),
  });

  if (!allowed) {
    return (
      <Alert color="yellow" title="Not available">
        Asset values are not shown to your role.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Asset valuation</Title>
        <Button variant="light" loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
          Export CSV
        </Button>
      </Group>

      <Group align="flex-end">
        <OrganizationSelect clearable w={240} value={organizationId} onChange={setOrganizationId} />
        <TextInput type="date" label="Value as at" description="Empty means today" value={asOf} onChange={(event) => setAsOf(event.currentTarget.value)} />
        <Switch label="Include decommissioned" checked={includeDecommissioned} onChange={(event) => setIncludeDecommissioned(event.currentTarget.checked)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load the valuation">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {report && (
        <>
          <Text c="dimmed" size="sm">
            Book values as at {new Date(`${report.asOf}T00:00:00`).toLocaleDateString()}.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <StatCard label="Assets valued" value={report.totals.count} />
            <StatCard label="Purchase cost" value={formatMoney(report.totals.cost)} />
            <StatCard label="Accumulated depreciation" value={formatMoney(report.totals.accumulatedDepreciation)} />
            <StatCard label="Book value" value={formatMoney(report.totals.bookValue)} />
          </SimpleGrid>
          {report.totals.notValued > 0 && (
            <Alert color="yellow">
              {report.totals.notValued} asset{report.totals.notValued === 1 ? ' has' : 's have'} no purchase cost, so {report.totals.notValued === 1 ? 'it is' : 'they are'} not valued.
            </Alert>
          )}

          <Title order={4}>By category</Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                <Table.Th ta="right">Assets</Table.Th>
                <Table.Th ta="right">Cost</Table.Th>
                <Table.Th ta="right">Depreciation</Table.Th>
                <Table.Th ta="right">Book value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {report.totals.byCategory.map((row) => (
                <Table.Tr key={row.category}>
                  <Table.Td>{row.category}</Table.Td>
                  <Table.Td ta="right">{row.count}</Table.Td>
                  <Table.Td ta="right">{formatMoney(row.cost)}</Table.Td>
                  <Table.Td ta="right">{formatMoney(row.accumulatedDepreciation)}</Table.Td>
                  <Table.Td ta="right">{formatMoney(row.bookValue)}</Table.Td>
                </Table.Tr>
              ))}
              {report.totals.byCategory.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>Nothing to value yet.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>

          <Title order={4}>Every asset</Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Asset</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Depreciation</Table.Th>
                <Table.Th ta="right">Cost</Table.Th>
                <Table.Th ta="right">Depreciation to date</Table.Th>
                <Table.Th ta="right">Book value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {report.rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/assets/${row.id}`}>
                      {row.assetTag} — {row.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={row.status} colors={ASSET_STATUS_COLORS} />
                  </Table.Td>
                  <Table.Td>
                    {methodLabel(row.method)}
                    {row.fullyDepreciated && (
                      <Badge ml="xs" variant="light" color="gray">
                        Fully depreciated
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{money(row.cost)}</Table.Td>
                  <Table.Td ta="right">{money(row.accumulatedDepreciation)}</Table.Td>
                  <Table.Td ta="right">{money(row.bookValue)}</Table.Td>
                </Table.Tr>
              ))}
              {report.rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>No assets.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}
