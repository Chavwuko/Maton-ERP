import { Avatar, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

// A person in a table: a round initials badge, their name, and a quieter line
// beneath (job title, department). The badge colour follows the name, so the
// same person always looks the same.
export function PersonCell({ name, detail }: { name: string; detail?: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Avatar size={34} radius="xl" color="initials" name={name} aria-hidden />
      <div>
        <Text fw={600} size="sm" style={{ whiteSpace: 'nowrap' }}>
          {name}
        </Text>
        {detail && (
          <Text size="xs" c="dimmed">
            {detail}
          </Text>
        )}
      </div>
    </Group>
  );
}
