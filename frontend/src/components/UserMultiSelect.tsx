import { MultiSelect, type MultiSelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../api/users';
import type { User } from '../modules/users/types';

function userLabel(user: User) {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name ? `${name} (${user.email})` : user.email;
}

interface UserMultiSelectProps extends Partial<MultiSelectProps> {
  // Not named `role` — that collides with Mantine's (and the DOM's) ARIA
  // `role` prop, which MultiSelectProps already declares with a narrower type.
  roleFilter?: string | string[];
}

export function UserMultiSelect({ label = 'Users', roleFilter, ...rest }: UserMultiSelectProps) {
  const { data } = useQuery({
    queryKey: ['users', { role: roleFilter }],
    queryFn: () => listUsers({ role: roleFilter }),
  });

  return (
    <MultiSelect
      label={label}
      placeholder="Select users"
      searchable
      data={(data ?? []).map((user) => ({ value: user.id, label: userLabel(user) }))}
      {...rest}
    />
  );
}
