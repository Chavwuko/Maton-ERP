import { Button, Menu, type MantineColor } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { StatusBadge } from './StatusBadge';

// Generic "current status + pick a legal next status" control, driven by
// the same ALLOWED_TRANSITIONS map each backend service enforces — the
// menu only ever offers moves the API will actually accept. Modules
// without any status of their own (Assets) don't use this.
export function StatusMenu<TStatus extends string>({
  status,
  transitions,
  colors,
  onChange,
  loading,
  disabled,
}: {
  status: TStatus;
  transitions: Record<TStatus, TStatus[]>;
  colors?: Record<string, MantineColor>;
  onChange: (next: TStatus) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const allowed = transitions[status] ?? [];

  if (disabled || allowed.length === 0) {
    return <StatusBadge status={status} colors={colors} />;
  }

  return (
    <Menu shadow="md" position="bottom-start">
      <Menu.Target>
        <Button
          variant="light"
          size="xs"
          loading={loading}
          rightSection={<IconChevronDown size={14} />}
        >
          <StatusBadge status={status} colors={colors} />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {allowed.map((next) => (
          <Menu.Item key={next} onClick={() => onChange(next)}>
            Move to {next.replace(/_/g, ' ')}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
