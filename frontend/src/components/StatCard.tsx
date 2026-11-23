import { Paper, Stack, Text } from '@mantine/core';

// A tile's tint says whether the number is good or needs attention, so a
// dashboard reads at a glance. Plain white is the default.
export type StatTone = 'neutral' | 'good' | 'bad' | 'warn';

const TONES: Record<StatTone, { background: string; border: string }> = {
  neutral: { background: '#ffffff', border: 'var(--app-line)' },
  good: { background: '#eaf6ee', border: '#cde7d5' },
  bad: { background: '#fdeeee', border: '#f5cfcf' },
  warn: { background: '#fff6e3', border: '#f2e0b4' },
};

// The basic building block for every department dashboard (HR's is the
// first) — a single headline number with a label underneath.
export function StatCard({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: StatTone }) {
  return (
    <Paper withBorder p="md" radius="lg" style={{ background: TONES[tone].background, borderColor: TONES[tone].border }}>
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
