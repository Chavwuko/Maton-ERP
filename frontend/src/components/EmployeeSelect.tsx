import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listEmployees } from '../api/hr';

export function EmployeeSelect({ label = 'Employee', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['employees'], queryFn: () => listEmployees() });

  return (
    <Select
      label={label}
      placeholder="Select employee"
      searchable
      data={(data ?? []).map((emp) => ({ value: emp.id, label: `${emp.employeeNumber} — ${emp.jobTitle}` }))}
      {...rest}
    />
  );
}
