import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listVendors } from '../api/accounting';

export function VendorSelect({ label = 'Vendor', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['vendors'], queryFn: () => listVendors() });

  return (
    <Select
      label={label}
      placeholder="Select vendor"
      searchable
      data={(data ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name }))}
      {...rest}
    />
  );
}
