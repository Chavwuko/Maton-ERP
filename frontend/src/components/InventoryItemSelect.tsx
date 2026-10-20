import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listInventoryItems } from '../api/inventory';

export function InventoryItemSelect({ label = 'Item', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['inventory-items'], queryFn: () => listInventoryItems() });

  return (
    <Select
      label={label}
      placeholder="Select item"
      searchable
      data={(data ?? []).map((item) => ({ value: item.id, label: `${item.sku} — ${item.name}` }))}
      {...rest}
    />
  );
}
