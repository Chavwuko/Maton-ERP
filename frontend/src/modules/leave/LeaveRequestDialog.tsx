import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { fileLeave } from '../../api/leave';
import type { LeaveBalance, LeaveType } from './types';

interface Props {
  opened: boolean;
  onClose: () => void;
  types: LeaveType[];
  balances: LeaveBalance[];
}

// Asking for leave: which kind, from when to when, and why. It goes to the
// supervisor or department head first, then HR, then the executive director.
export function LeaveRequestDialog({ opened, onClose, types, balances }: Props) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { leaveTypeId: '', startDate: '', endDate: '', reason: '' },
    validate: {
      leaveTypeId: (value) => (value ? null : 'Choose the kind of leave'),
      startDate: (value) => (value ? null : 'First day is required'),
      endDate: (value, values) => {
        if (!value) return 'Last day is required';
        return values.startDate && value < values.startDate ? 'The last day cannot be before the first' : null;
      },
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      fileLeave({ leaveTypeId: values.leaveTypeId, startDate: values.startDate, endDate: values.endDate, reason: values.reason.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      notifications.show({ message: 'Leave request sent for approval', color: 'green' });
      onClose();
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to send the leave request', color: 'red' });
    },
  });

  const left = balances.find((balance) => balance.leaveTypeId === form.values.leaveTypeId);

  return (
    <Modal opened={opened} onClose={onClose} title="Request leave">
      <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <Select
            label="Kind of leave"
            placeholder="Choose"
            required
            data={types.map((type) => ({ value: type.id, label: type.name }))}
            {...form.getInputProps('leaveTypeId')}
          />
          {left && (
            <Text size="sm" c="dimmed">
              {left.remaining === null ? 'No yearly limit on this kind of leave.' : `You have ${left.remaining} working day${left.remaining === 1 ? '' : 's'} left this year.`}
            </Text>
          )}
          <Group grow align="flex-start">
            <TextInput type="date" label="First day away" required {...form.getInputProps('startDate')} />
            <TextInput type="date" label="Last day away" required {...form.getInputProps('endDate')} />
          </Group>
          <Textarea label="Reason" placeholder="Optional" {...form.getInputProps('reason')} />
          <Text size="xs" c="dimmed">
            Your supervisor or department head decides first, then HR, then the executive director. Weekends are not counted.
          </Text>
          <Group justify="flex-end">
            <Button type="submit" loading={mutation.isPending}>
              Send request
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
