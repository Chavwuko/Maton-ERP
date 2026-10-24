import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart } from '@mantine/charts';
import { Alert, Anchor, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getInventoryDashboard } from '../../api/reports';
import { BucketBarChart } from '../../components/BucketBarChart';
import { BucketPieChart } from '../../components/BucketPieChart';
import { StatCard } from '../../components/StatCard';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { appointmentDate, personName, APPOINTMENT_STATUS_COLORS, APPOINTMENT_STATUS_LABELS, type Appointment } from '../appointments/types';
import { formatMoney, formatQty } from './format';
import type { ManagementDashboard, MyDashboard, RankedValue } from './reportTypes';
import { STOCK_STATUS_COLORS, STOCK_STATUS_LABELS, STOCK_TRANSACTION_TYPE_COLORS, type StockTransactionType } from './types';

// The chart components take { label, count } buckets (HR's shape).
const toBuckets = (data: RankedValue[]) => data.map((entry) => ({ label: entry.name, count: entry.value }));

function ActionCard({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Paper withBorder p="md" radius="md" component={Link} to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Stack gap={4}>
        <Text size="xl" fw={700} c={value > 0 ? 'orange' : undefined}>
          {value}
        </Text>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Paper>
  );
}

function AppointmentLine({ appointment }: { appointment: Appointment }) {
  return (
    <Table.Tr>
      <Table.Td>
        {appointmentDate(appointment.date)} {appointment.time}
      </Table.Td>
      <Table.Td>{appointment.subject}</Table.Td>
      <Table.Td>{personName(appointment.requester)}</Table.Td>
      <Table.Td>
        <Badge color={APPOINTMENT_STATUS_COLORS[appointment.status]} variant="light">
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </Badge>
      </Table.Td>
    </Table.Tr>
  );
}

function Management({ dashboard }: { dashboard: ManagementDashboard }) {
  const { role } = useRole();
  const { kpi, actions } = dashboard;
  const monthly = dashboard.monthly.labels.map((month, index) => ({
    month,
    Purchases: dashboard.monthly.purchases[index],
    Consumption: dashboard.monthly.consumption[index],
  }));

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <ActionCard label="Appointments awaiting review" value={actions.pendingAppointments} to="/appointments?tab=all" />
        <ActionCard label="Appointments today" value={actions.todayAppointments} to="/appointments?tab=all" />
        {hasRole(role, ['admin']) && (
          <ActionCard label="Sign-up requests waiting" value={actions.accessRequests} to="/users?tab=requests" />
        )}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 3, md: 6 }}>
        <StatCard label="Items" value={kpi.items} />
        <StatCard label="Stock value" value={formatMoney(kpi.stockValue)} />
        <StatCard label="Low stock" value={kpi.low} />
        <StatCard label="Out of stock" value={kpi.out} />
        <StatCard label="Purchases this month" value={formatMoney(kpi.purchasesMonth)} />
        <StatCard label="Issued this month" value={formatMoney(kpi.consumptionMonth)} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text fw={600}>Purchases vs issues, last 6 months</Text>
            <BarChart
              h={260}
              data={monthly}
              dataKey="month"
              series={[
                { name: 'Purchases', color: 'blue.6' },
                { name: 'Consumption', color: 'orange.6' },
              ]}
              withTooltip
            />
          </Stack>
        </Paper>
        <BucketPieChart title="Stock value by category" data={toBuckets(dashboard.byCategory)} />
        <BucketBarChart title="Most consumed (last 90 days, by cost)" data={toBuckets(dashboard.topConsumed)} seriesName="Cost" color="orange.6" />
        <BucketPieChart title="Issues by department (last 90 days)" data={toBuckets(dashboard.byDepartment)} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Stack gap="xs">
          <Title order={4}>Stock alerts</Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>On hand</Table.Th>
                <Table.Th>Reorder at</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dashboard.alerts.map((alert) => (
                <Table.Tr key={alert.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/inventory/items/${alert.id}`}>
                      {alert.sku}
                    </Anchor>{' '}
                    {alert.name}
                  </Table.Td>
                  <Table.Td>
                    {formatQty(alert.onHand)} {alert.unit}
                  </Table.Td>
                  <Table.Td>{alert.reorderPoint ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={STOCK_STATUS_COLORS[alert.status]} variant="light">
                      {STOCK_STATUS_LABELS[alert.status]}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
              {dashboard.alerts.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>Nothing is low or out of stock.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>

        <Stack gap="xs">
          <Title order={4}>Upcoming appointments</Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Subject</Table.Th>
                <Table.Th>Requester</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dashboard.upcoming.map((appointment) => (
                <AppointmentLine key={appointment.id} appointment={appointment} />
              ))}
              {dashboard.upcoming.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>No upcoming appointments.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </SimpleGrid>

      <Stack gap="xs">
        <Title order={4}>Recent stock movements</Title>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>Warehouse</Table.Th>
              <Table.Th>Quantity</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dashboard.recent.map((movement) => (
              <Table.Tr key={movement.id}>
                <Table.Td>{new Date(movement.createdAt).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  <Badge color={STOCK_TRANSACTION_TYPE_COLORS[movement.type as StockTransactionType] ?? 'gray'} variant="light">
                    {movement.type}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {movement.item.sku} — {movement.item.name}
                </Table.Td>
                <Table.Td>{movement.warehouse.code}</Table.Td>
                <Table.Td>{formatQty(movement.quantity)}</Table.Td>
              </Table.Tr>
            ))}
            {dashboard.recent.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No stock movements yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Stack>
    </Stack>
  );
}

function Mine({ dashboard }: { dashboard: MyDashboard }) {
  return (
    <Stack>
      <Group justify="space-between">
        <Text>Hello, {dashboard.name}.</Text>
        <Button component={Link} to="/appointments">
          Book an appointment
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <StatCard label="Pending" value={dashboard.counts.pending} />
        <StatCard label="Approved" value={dashboard.counts.approved} />
        <StatCard label="Completed" value={dashboard.counts.completed} />
        <StatCard label="Declined" value={dashboard.counts.declined} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Stack gap="xs">
          <Title order={4}>Your upcoming appointments</Title>
          <Table striped>
            <Table.Tbody>
              {dashboard.upcoming.map((appointment) => (
                <AppointmentLine key={appointment.id} appointment={appointment} />
              ))}
              {dashboard.upcoming.length === 0 && (
                <Table.Tr>
                  <Table.Td>You have nothing booked.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>

        <Stack gap="xs">
          <Title order={4}>Recent feedback from the store</Title>
          {dashboard.feedback.map((appointment) => (
            <Paper key={appointment.id} withBorder p="sm" radius="md">
              <Text size="sm" fw={500}>
                {appointment.subject}
              </Text>
              <Text size="sm">{appointment.feedback}</Text>
              {appointment.feedbackBy && (
                <Text size="xs" c="dimmed">
                  — {personName(appointment.feedbackBy)}
                </Text>
              )}
            </Paper>
          ))}
          {dashboard.feedback.length === 0 && (
            <Text size="sm" c="dimmed">
              No feedback yet.
            </Text>
          )}
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

export function InventoryDashboardPage() {
  const {
    data: dashboard,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['inventory-dashboard'], queryFn: getInventoryDashboard });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load the dashboard">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!dashboard) return null;

  return (
    <Stack>
      <Title order={2}>Inventory Dashboard</Title>
      {dashboard.kind === 'management' ? <Management dashboard={dashboard} /> : <Mine dashboard={dashboard} />}
    </Stack>
  );
}
