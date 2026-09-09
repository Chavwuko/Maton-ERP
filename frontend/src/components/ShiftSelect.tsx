import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listShifts } from '../api/hr';

export function ShiftSelect({ label = 'Shift', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['shifts'], queryFn: () => listShifts() });

  return (
    <Select
      label={label}
      placeholder="Select shift"
      searchable
      clearable
      data={(data ?? []).map((shift) => ({ value: shift.id, label: `${shift.name} (${shift.startTime}–${shift.endTime})` }))}
      {...rest}
    />
  );
}
