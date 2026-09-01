import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listOrganizations } from '../api/organizations';

// Every module's create form needs to pick an organizationId — there's no
// "current org" concept in the app yet, so each form asks explicitly.
export function OrganizationSelect({ label = 'Organization', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['organizations'], queryFn: listOrganizations });

  return (
    <Select
      label={label}
      placeholder="Select organization"
      searchable
      data={(data ?? []).map((org) => ({ value: org.id, label: org.name }))}
      {...rest}
    />
  );
}
