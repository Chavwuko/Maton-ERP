import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Group, Loader, NumberInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getAppointmentSchedule, updateAppointmentSchedule } from '../../api/appointments';
import { WEEKDAYS } from './types';

// When the store takes appointments. Admin only.
export function SchedulePanel() {
  const queryClient = useQueryClient();

  const {
    data: schedule,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['appointment-schedule'], queryFn: getAppointmentSchedule });

  const form = useForm({
    initialValues: {
      workStart: '08:00',
      workEnd: '17:00',
      slotMinutes: 30 as number | string,
      slotCapacity: 1 as number | string,
      workingDays: [] as string[],
      timeZone: '',
    },
    validate: {
      workingDays: (value) => (value.length > 0 ? null : 'Select at least one working day'),
      timeZone: (value) => (value.trim() ? null : 'Enter a time zone, e.g. Africa/Lagos'),
    },
  });

  useEffect(() => {
    if (schedule) {
      form.setValues({
        workStart: schedule.workStart,
        workEnd: schedule.workEnd,
        slotMinutes: schedule.slotMinutes,
        slotCapacity: schedule.slotCapacity,
        workingDays: schedule.workingDays.map(String),
        timeZone: schedule.timeZone,
      });
      form.resetDirty();
    }
    // Re-seed only when fresh settings arrive, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      updateAppointmentSchedule({
        workStart: values.workStart,
        workEnd: values.workEnd,
        slotMinutes: Number(values.slotMinutes),
        slotCapacity: Number(values.slotCapacity),
        workingDays: values.workingDays.map(Number),
        timeZone: values.timeZone.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-slots'] });
      notifications.show({ message: 'Schedule saved', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to save schedule', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load the schedule">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
      <Stack maw={480}>
        <Group grow>
          <TextInput type="time" label="Opens" {...form.getInputProps('workStart')} />
          <TextInput type="time" label="Closes" {...form.getInputProps('workEnd')} />
        </Group>
        <Group grow align="flex-start">
          <NumberInput
            label="Appointment length (minutes)"
            description="10 to 240, in steps of 5"
            min={10}
            max={240}
            step={5}
            {...form.getInputProps('slotMinutes')}
          />
          <NumberInput
            label="Appointments per slot"
            description="How many people the store can see at once"
            min={1}
            max={50}
            {...form.getInputProps('slotCapacity')}
          />
        </Group>
        <Checkbox.Group label="Working days" {...form.getInputProps('workingDays')}>
          <Group mt="xs">
            {WEEKDAYS.map((name, index) => (
              <Checkbox key={name} value={String(index)} label={name} />
            ))}
          </Group>
        </Checkbox.Group>
        <TextInput
          label="Time zone"
          description="Slots and the is-it-in-the-past check use the clock in this zone"
          {...form.getInputProps('timeZone')}
        />
        <Group>
          <Button type="submit" loading={mutation.isPending}>
            Save schedule
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
