import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getAssetDashboard } from '../../api/assets';
import { BucketPieChart } from '../../components/BucketPieChart';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatCard } from '../../components/StatCard';
import { formatMoney } from '../inventory/format';
import { assetDate } from './types';

const STATUS_LABELS = { ACTIVE: 'Active', UNDER_MAINTENANCE: 'Under maintenance', DECOMMISSIONED: 'Decommissioned' };
const CONDITION_LABELS = { NEW: 'New', GOOD: 'Good', FAIR: 'Fair', POOR: 'Poor' };

// The asset overview: how many, in what state, what needs attention and what
// the register is worth. Open to everyone; the money is left out for staff.
export function AssetsDashboardPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const {
    data: dashboard,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assets', 'dashboard', { organizationId }],
    queryFn: () => getAssetDashboard(organizationId ?? undefined),
  });

  return (
    <Stack>
      <Title order={2}>Asset dashboard</Title>
      <Group>
        <OrganizationSelect clearable w={240} value={organizationId} onChange={setOrganizationId} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load the dashboard">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {dashboard && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <StatCard label="Assets" value={dashboard.assetCount} />
            <StatCard label="Checked out" value={dashboard.checkedOut} />
            <StatCard label="Open work orders" value={dashboard.maintenance.openWorkOrders} />
            {dashboard.totals.bookValue !== undefined && <StatCard label="Book value" value={formatMoney(dashboard.totals.bookValue)} />}
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <StatCard label="Maintenance overdue" value={dashboard.maintenance.overdueSchedules} />
            <StatCard label="Maintenance due soon" value={dashboard.maintenance.dueSoonSchedules} />
            <StatCard label="Returns overdue" value={dashboard.overdueReturns.count} />
            <StatCard label="Warranties ending in 60 days" value={dashboard.warrantyExpiring.count} />
          </SimpleGrid>
          {dashboard.totals.notValued > 0 && dashboard.totals.bookValue !== undefined && (
            <Text size="sm" c="dimmed">
              {dashboard.totals.notValued} asset{dashboard.totals.notValued === 1 ? ' has' : 's have'} no purchase cost and {dashboard.totals.notValued === 1 ? 'is' : 'are'} not in the book value.
            </Text>
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <BucketPieChart title="By status" data={dashboard.byStatus} labelMap={STATUS_LABELS} />
            <BucketPieChart title="By condition (in service)" data={dashboard.byCondition} labelMap={CONDITION_LABELS} />
          </SimpleGrid>

          <Title order={4}>Overdue returns</Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Asset</Table.Th>
                <Table.Th>Held by</Table.Th>
                <Table.Th>Was due back</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dashboard.overdueReturns.items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/assets/${item.asset.id}`}>
                      {item.asset.assetTag} — {item.asset.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    {item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}`.trim() || item.assignee.email : (item.department?.name ?? '—')}
                  </Table.Td>
                  <Table.Td>{assetDate(item.expectedReturn)}</Table.Td>
                </Table.Tr>
              ))}
              {dashboard.overdueReturns.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={3}>Nothing is overdue.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>

          <Title order={4}>Warranties ending soon</Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Asset</Table.Th>
                <Table.Th>Warranty ends</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dashboard.warrantyExpiring.items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/assets/${item.id}`}>
                      {item.assetTag} — {item.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{assetDate(item.warrantyExpiry)}</Table.Td>
                </Table.Tr>
              ))}
              {dashboard.warrantyExpiring.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={2}>No warranties end in the next 60 days.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}
