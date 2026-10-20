import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listItemCategories } from '../api/inventory';

export function ItemCategorySelect({ label = 'Category', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['item-categories'], queryFn: () => listItemCategories() });

  return (
    <Select
      label={label}
      placeholder="Select category"
      searchable
      clearable
      data={(data ?? []).map((category) => ({ value: category.id, label: category.name }))}
      {...rest}
    />
  );
}
