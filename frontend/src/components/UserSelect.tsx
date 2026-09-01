import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../api/users';
import type { User } from '../modules/users/types';

// Cognito lazily creates a User on first login with blank first/last name —
// fall back to the email so the picker never shows a blank option.
function userLabel(user: User) {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name ? `${name} (${user.email})` : user.email;
}

interface UserSelectProps extends Partial<SelectProps> {
  // Not named `role` — that collides with Mantine's (and the DOM's) ARIA
  // `role` prop, which SelectProps already declares with a narrower type.
  roleFilter?: string | string[];
}

export function UserSelect({ label = 'User', roleFilter, ...rest }: UserSelectProps) {
  const { data } = useQuery({
    queryKey: ['users', { role: roleFilter }],
    queryFn: () => listUsers({ role: roleFilter }),
  });

  return (
    <Select
      label={label}
      placeholder="Select user"
      searchable
      data={(data ?? []).map((user) => ({ value: user.id, label: userLabel(user) }))}
      {...rest}
    />
  );
}
