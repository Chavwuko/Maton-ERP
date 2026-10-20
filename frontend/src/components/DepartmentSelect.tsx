import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listDepartments } from '../api/organizations';

export function DepartmentSelect({ label = 'Department', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['departments'], queryFn: () => listDepartments() });

  return (
    <Select
      label={label}
      placeholder="Select department"
      searchable
      clearable
      data={(data ?? []).map((dept) => ({ value: dept.id, label: dept.name }))}
      {...rest}
    />
  );
}
