import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Alert, Button, Group, Loader, NumberInput, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { bookAppointment, getSlots } from '../../api/appointments';
import { InventoryItemSelect } from '../../components/InventoryItemSelect';
import { APPOINTMENT_TYPES } from './types';

interface ItemRow {
  key: number;
  itemId: string;
  quantity: number | string;
}

const todayLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

// Pick a day, pick a free slot, say what you need. The store reviews it
// afterwards (see AllAppointmentsPanel).
export function BookPanel() {
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState('');
  const [slotError, setSlotError] = useState('');

  const form = useForm({
    initialValues: {
      date: '',
      type: APPOINTMENT_TYPES[0],
      subject: '',
      details: '',
      items: [] as ItemRow[],
    },
    validate: {
      date: (value) => (value ? null : 'Choose a date'),
      subject: (value) => (value.trim() ? null : 'Please give your appointment a subject'),
      items: {
        itemId: (value) => (value ? null : 'Choose an item'),
        quantity: (value) => (value === '' || Number(value) <= 0 ? 'Enter a quantity' : null),
      },
    },
  });

  const { date } = form.values;
  const {
    data: day,
    isLoading: slotsLoading,
    isError: slotsError,
    error: slotsErr,
  } = useQuery({
    queryKey: ['appointment-slots', date],
    queryFn: () => getSlots(date),
    enabled: !!date,
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      bookAppointment({
        date: values.date,
        time: slot,
        type: values.type,
        subject: values.subject,
        details: values.details || undefined,
        items: values.items.map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-slots'] });
      notifications.show({ message: 'Appointment booked. The store will review it.', color: 'green' });
      form.reset();
      setSlot('');
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['appointment-slots'] });
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to book appointment', color: 'red' });
    },
  });

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) => {
        if (!slot) {
          setSlotError('Choose a time slot');
          return;
        }
        mutation.mutate(values);
      })}
    >
      <Stack maw={640}>
        <TextInput
          type="date"
          label="Date"
          required
          min={todayLocal()}
          {...form.getInputProps('date')}
          onChange={(event) => {
            form.setFieldValue('date', event.currentTarget.value);
            setSlot('');
            setSlotError('');
          }}
        />

        <div>
          <Text size="sm" fw={500}>
            Time slot
          </Text>
          {!date && (
            <Text size="sm" c="dimmed">
              Pick a date to see the available times.
            </Text>
          )}
          {date && slotsLoading && <Loader size="sm" />}
          {date && slotsError && (
            <Alert color="red" title="Couldn't load slots">
              {slotsErr instanceof ApiError ? slotsErr.message : 'Unknown error'}
            </Alert>
          )}
          {day && !day.working && (
            <Text size="sm" c="dimmed">
              The store does not take appointments on this day. Please choose a working day.
            </Text>
          )}
          {day?.working && (
            <Group gap="xs" mt={4}>
              {day.slots.map((s) => (
                <Button
                  key={s.time}
                  type="button"
                  size="xs"
                  variant={slot === s.time ? 'filled' : 'default'}
                  disabled={!s.available}
                  onClick={() => {
                    setSlot(s.time);
                    setSlotError('');
                  }}
                >
                  {s.time}
                  {s.booked >= s.capacity ? ' (full)' : ''}
                </Button>
              ))}
            </Group>
          )}
          {slotError && (
            <Text size="xs" c="red" mt={4}>
              {slotError}
            </Text>
          )}
        </div>

        <Select
          label="What is this for?"
          data={APPOINTMENT_TYPES}
          allowDeselect={false}
          {...form.getInputProps('type')}
        />
        <TextInput label="Subject" placeholder="Gloves and helmets for new hires" required {...form.getInputProps('subject')} />
        <Textarea label="Details" {...form.getInputProps('details')} />

        <div>
          <Text size="sm" fw={500}>
            Items you need
          </Text>
          <Stack gap="xs" mt={4}>
            {form.values.items.map((row, index) => (
              <Group key={row.key} align="flex-start" wrap="nowrap">
                <InventoryItemSelect
                  label={index === 0 ? 'Item' : undefined}
                  aria-label={`Item ${index + 1}`}
                  style={{ flex: 1 }}
                  {...form.getInputProps(`items.${index}.itemId`)}
                />
                <NumberInput
                  label={index === 0 ? 'Quantity' : undefined}
                  aria-label={`Quantity ${index + 1}`}
                  min={0}
                  decimalScale={3}
                  w={120}
                  {...form.getInputProps(`items.${index}.quantity`)}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  mt={index === 0 ? 25 : 0}
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => form.removeListItem('items', index)}
                >
                  ✕
                </ActionIcon>
              </Group>
            ))}
            <Group>
              <Button
                type="button"
                variant="light"
                size="xs"
                onClick={() =>
                  form.insertListItem('items', { key: Math.random(), itemId: '', quantity: 1 } satisfies ItemRow)
                }
              >
                Add an item
              </Button>
            </Group>
          </Stack>
        </div>

        <Group>
          <Button type="submit" loading={mutation.isPending}>
            Book appointment
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
