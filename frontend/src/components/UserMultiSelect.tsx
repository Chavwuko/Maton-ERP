import { MultiSelect, type MultiSelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../api/users';
import type { User } from '../modules/users/types';

function userLabel(user: User) {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name ? `${name} (${user.email})` : user.email;
}

interface UserMultiSelectProps extends Partial<MultiSelectProps> {
  role?: string | string[];
}

export function UserMultiSelect({ label = 'Users', role, ...rest }: UserMultiSelectProps) {
  const { data } = useQuery({ queryKey: ['users', { role }], queryFn: () => listUsers({ role }) });

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
