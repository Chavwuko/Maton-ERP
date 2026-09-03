import { PieChart } from '@mantine/charts';
import { Paper, Stack, Text } from '@mantine/core';
import type { DashboardBucket } from '../modules/hr/types';

// Cycled by index rather than keyed by label, so it stays stable regardless
// of which enum/free-text values a given breakdown happens to contain.
const COLORS = [
  'blue.6',
  'grape.6',
  'teal.6',
  'orange.6',
  'red.6',
  'indigo.6',
  'lime.7',
  'pink.6',
  'cyan.6',
  'yellow.7',
];

export function BucketPieChart({
  title,
  data,
  labelMap = {},
}: {
  title: string;
  data: DashboardBucket[];
  labelMap?: Record<string, string>;
}) {
  const chartData = data
    .filter((bucket) => bucket.count > 0)
    .map((bucket, index) => ({
      name: labelMap[bucket.label] ?? bucket.label,
      value: bucket.count,
      color: COLORS[index % COLORS.length],
    }));

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm" align="center">
        <Text fw={600}>{title}</Text>
        {chartData.length > 0 ? (
          <PieChart data={chartData} withLabelsLine withLabels labelsPosition="outside" withTooltip size={200} />
        ) : (
          <Text size="sm" c="dimmed">
            No data yet.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
