import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Group, Modal, NumberInput, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createSchedule, updateSchedule } from '../../api/maintenance';
import { ApiError } from '../../api/client';
import { AssetSelect } from '../../components/AssetSelect';
import { UserSelect } from '../../components/UserSelect';
import {
  INTERVAL_UNITS,
  SCHEDULE_BASES,
  type MaintenanceSchedule,
  type ScheduleBasis,
  type ScheduleIntervalUnit,
  type WorkOrderPriority,
} from './types';

interface Props {
  opened: boolean;
  onClose: () => void;
  // Editing this one; leave out to plan a new one.
  schedule?: MaintenanceSchedule;
  // Plan a new one for this asset without asking which.
  assetId?: string;
}

const PRIORITIES: WorkOrderPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Mantine's NumberInput hands back a string while the field is being cleared.
const wholeNumber = (value: unknown) => Number.isInteger(Number(value)) && String(value).trim() !== '';

export function ScheduleDialog({ opened, onClose, schedule, assetId }: Props) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      assetId: schedule?.assetId ?? assetId ?? '',
      title: schedule?.title ?? '',
      description: schedule?.description ?? '',
      intervalValue: (schedule?.intervalValue ?? 1) as number | string,
      intervalUnit: (schedule?.intervalUnit ?? 'MONTHS') as ScheduleIntervalUnit,
      basis: (schedule?.basis ?? 'FIXED') as ScheduleBasis,
      // The first due date when planning, the next one when editing.
      dueDate: schedule?.nextDueDate.slice(0, 10) ?? '',
      leadDays: (schedule?.leadDays ?? 7) as number | string,
      priority: (schedule?.priority ?? 'MEDIUM') as WorkOrderPriority,
      assignedToId: schedule?.assignedToId ?? '',
    },
    validate: {
      assetId: (value) => (value ? null : 'Asset is required'),
      title: (value) => (value.trim() ? null : 'Title is required'),
      intervalValue: (value) => (wholeNumber(value) && Number(value) >= 1 ? null : 'Enter a whole number, 1 or more'),
      dueDate: (value) => (value ? null : 'Date is required'),
      leadDays: (value) => (wholeNumber(value) && Number(value) >= 0 ? null : 'Enter a whole number, 0 or more'),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) => {
      const common = {
        title: values.title.trim(),
        intervalValue: Number(values.intervalValue),
        intervalUnit: values.intervalUnit,
        basis: values.basis,
        priority: values.priority,
        leadDays: Number(values.leadDays),
      };
      return schedule
        ? updateSchedule(schedule.id, {
            ...common,
            description: values.description.trim() || null,
            assignedToId: values.assignedToId || null,
            nextDueDate: values.dueDate,
          })
        : createSchedule({
            ...common,
            assetId: values.assetId,
            description: values.description.trim() || undefined,
            assignedToId: values.assignedToId || undefined,
            firstDueDate: values.dueDate,
          });
    },
    onSuccess: () => {
      // A new or changed schedule may have opened a work order straight away.
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      notifications.show({ message: schedule ? 'Schedule updated' : 'Schedule created', color: 'green' });
      onClose();
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to save schedule', color: 'red' });
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title={schedule ? `Edit ${schedule.title}` : 'New maintenance schedule'} size="lg">
      <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <AssetSelect required disabled={!!schedule || !!assetId} {...form.getInputProps('assetId')} />
          <TextInput label="Task" placeholder="Grease the bearings" required {...form.getInputProps('title')} />
          <Textarea label="Instructions" {...form.getInputProps('description')} />
          <Group grow align="flex-start">
            <NumberInput label="Repeat every" min={1} allowDecimal={false} required {...form.getInputProps('intervalValue')} />
            <Select label="Unit" data={INTERVAL_UNITS} allowDeselect={false} {...form.getInputProps('intervalUnit')} />
          </Group>
          <Select
            label="Counted from"
            description={SCHEDULE_BASES.find((basis) => basis.value === form.values.basis)?.description}
            data={SCHEDULE_BASES.map(({ value, label }) => ({ value, label }))}
            allowDeselect={false}
            {...form.getInputProps('basis')}
          />
          <Group grow align="flex-start">
            <TextInput type="date" label={schedule ? 'Next due' : 'First due'} required {...form.getInputProps('dueDate')} />
            <NumberInput
              label="Open a work order this many days ahead"
              min={0}
              allowDecimal={false}
              {...form.getInputProps('leadDays')}
            />
          </Group>
          <Select label="Priority" data={PRIORITIES} allowDeselect={false} {...form.getInputProps('priority')} />
          <UserSelect label="Assign to" description="Leave empty to tell the maintenance team" clearable {...form.getInputProps('assignedToId')} />
          <Group justify="flex-end">
            <Button type="submit" loading={mutation.isPending}>
              {schedule ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
