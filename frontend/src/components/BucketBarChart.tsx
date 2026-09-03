import { BarChart } from '@mantine/charts';
import { Paper, Stack, Text } from '@mantine/core';
import type { DashboardBucket } from '../modules/hr/types';

export function BucketBarChart({
  title,
  data,
  seriesName = 'Employees',
  color = 'blue.6',
}: {
  title: string;
  data: DashboardBucket[];
  seriesName?: string;
  color?: string;
}) {
  const chartData = data.map((bucket) => ({ label: bucket.label, [seriesName]: bucket.count }));

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={600}>{title}</Text>
        <BarChart h={260} data={chartData} dataKey="label" series={[{ name: seriesName, color }]} withTooltip />
      </Stack>
    </Paper>
  );
}
