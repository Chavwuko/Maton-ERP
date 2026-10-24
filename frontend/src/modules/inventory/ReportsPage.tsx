import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { downloadReportCsv, getInventoryReport } from '../../api/reports';
import { StatCard } from '../../components/StatCard';
import { saveTextFile } from '../../lib/saveFile';
import { formatMoney, formatQty } from './format';
import type { InventoryReport, Totals } from './reportTypes';

const MORE_EXPORTS = [
  { type: 'stock', label: 'Stock list' },
  { type: 'purchases', label: 'All purchases' },
  { type: 'consumption', label: 'All issues' },
];

function Section({
  title,
  exportType,
  onExport,
  busy,
  children,
}: {
  title: string;
  exportType: string;
  onExport: (type: string) => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={4}>{title}</Title>
        <Button size="compact-xs" variant="light" loading={busy} onClick={() => onExport(exportType)}>
          Export CSV
        </Button>
      </Group>
      {children}
    </Stack>
  );
}

function TotalsTable({ rows, label, countLabel }: { rows: Totals[]; label: string; countLabel: string }) {
  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{label}</Table.Th>
          <Table.Th>{countLabel}</Table.Th>
          <Table.Th>Total</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.name}>
            <Table.Td>{row.name}</Table.Td>
            <Table.Td>{row.count}</Table.Td>
            <Table.Td>{formatMoney(row.total)}</Table.Td>
          </Table.Tr>
        ))}
        {rows.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={3}>No data for this period.</Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );
}

// Spend, usage and stock value, for a date range, each exportable as CSV.
export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const {
    data: report,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['inventory-report', { from, to }],
    queryFn: () => getInventoryReport({ from: from || undefined, to: to || undefined }),
  });

  const exportMutation = useMutation({
    mutationFn: (type: string) => downloadReportCsv(type, { from: from || undefined, to: to || undefined }),
    onSuccess: ({ filename, text }) => saveTextFile(filename, text),
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to export', color: 'red' }),
  });
  const exporting = (type: string) => exportMutation.isPending && exportMutation.variables === type;
  const exportCsv = (type: string) => exportMutation.mutate(type);

  const body = (data: InventoryReport) => (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <StatCard label="Purchases" value={formatMoney(data.totals.purchases)} />
        <StatCard label="Issued to departments and projects" value={formatMoney(data.totals.consumption)} />
        <StatCard label="Purchase lines / issue lines" value={`${data.totals.purchaseLines} / ${data.totals.issueLines}`} />
        <StatCard
          label="Appointments (completed / pending)"
          value={`${data.totals.appointments} (${data.totals.appointmentsCompleted} / ${data.totals.appointmentsPending})`}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Section title="Spend by supplier" exportType="suppliers" onExport={exportCsv} busy={exporting('suppliers')}>
          <TotalsTable rows={data.bySupplier} label="Supplier" countLabel="Purchases" />
        </Section>
        <Section title="Cost by project" exportType="projects" onExport={exportCsv} busy={exporting('projects')}>
          <TotalsTable rows={data.byProject} label="Project" countLabel="Issues" />
        </Section>
        <Section title="Cost by department" exportType="departments" onExport={exportCsv} busy={exporting('departments')}>
          <TotalsTable rows={data.byDepartment} label="Department" countLabel="Issues" />
        </Section>
        <Section title="Stock value by category" exportType="valuation" onExport={exportCsv} busy={exporting('valuation')}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.valuation.map((row) => (
                <Table.Tr key={row.name}>
                  <Table.Td>{row.name}</Table.Td>
                  <Table.Td>{row.items}</Table.Td>
                  <Table.Td>{formatMoney(row.value)}</Table.Td>
                </Table.Tr>
              ))}
              {data.valuation.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={3}>No stock yet.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Section>
      </SimpleGrid>

      <Section title="Most consumed items" exportType="items" onExport={exportCsv} busy={exporting('items')}>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th>Quantity issued</Table.Th>
              <Table.Th>Cost</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.byItem.map((row) => (
              <Table.Tr key={row.sku}>
                <Table.Td>
                  {row.sku} — {row.name}
                </Table.Td>
                <Table.Td>
                  {formatQty(row.quantity)} {row.unit}
                </Table.Td>
                <Table.Td>{formatMoney(row.value)}</Table.Td>
              </Table.Tr>
            ))}
            {data.byItem.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>No data for this period.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Section>

      <Group gap="xs">
        <Text size="sm" c="dimmed">
          Full exports:
        </Text>
        {MORE_EXPORTS.map((entry) => (
          <Button key={entry.type} size="compact-xs" variant="light" loading={exporting(entry.type)} onClick={() => exportCsv(entry.type)}>
            {entry.label}
          </Button>
        ))}
      </Group>
    </Stack>
  );

  return (
    <Stack>
      <Title order={2}>Reports</Title>
      <Group align="flex-end">
        <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load the report">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}
      {report && body(report)}
    </Stack>
  );
}
