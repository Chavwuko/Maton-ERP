import { Paper, Stack, Text } from '@mantine/core';

// The basic building block for every department dashboard (HR's is the
// first) — a single headline number with a label underneath.
export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={4}>
        <Text size="xl" fw={700}>
          {value}
        </Text>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Paper>
  );
}
