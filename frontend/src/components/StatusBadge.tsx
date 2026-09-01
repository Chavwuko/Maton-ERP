import { Badge, type MantineColor } from '@mantine/core';

const DEFAULT_COLOR: MantineColor = 'gray';

export function StatusBadge({ status, colors }: { status: string; colors?: Record<string, MantineColor> }) {
  return (
    <Badge color={colors?.[status] ?? DEFAULT_COLOR} variant="light">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
