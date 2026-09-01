import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listWarehouses } from '../api/inventory';

export function WarehouseSelect({ label = 'Warehouse', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['warehouses'], queryFn: () => listWarehouses() });

  return (
    <Select
      label={label}
      placeholder="Select warehouse"
      searchable
      data={(data ?? []).map((wh) => ({ value: wh.id, label: `${wh.code} — ${wh.name}` }))}
      {...rest}
    />
  );
}
