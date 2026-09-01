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
  role?: string | string[];
}

export function UserSelect({ label = 'User', role, ...rest }: UserSelectProps) {
  const { data } = useQuery({ queryKey: ['users', { role }], queryFn: () => listUsers({ role }) });

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
