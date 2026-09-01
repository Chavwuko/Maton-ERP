import { Anchor, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '../api/auth';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export function SessionBadge() {
  const { data: session } = useQuery({ queryKey: ['session'], queryFn: getSession, retry: false });

  return (
    <Group gap="xs">
      {session && (
        <Text size="sm" c="dimmed">
          {session.email} ({session.roleName ?? 'no role'})
        </Text>
      )}
      <Anchor href={`${API_BASE_URL}/auth/logout`} size="sm">
        Log out
      </Anchor>
    </Group>
  );
}
