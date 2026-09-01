import { Group, Select, Text } from '@mantine/core';
import { useRole } from '../auth/RoleContext';
import { ROLES, type Role } from '../auth/roleStore';

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <Group gap="xs">
      <Text size="sm" c="dimmed">
        Acting as
      </Text>
      <Select
        value={role}
        onChange={(value) => value && setRole(value as Role)}
        data={ROLES.map((r) => ({ value: r, label: r }))}
        allowDeselect={false}
        w={180}
      />
    </Group>
  );
}
