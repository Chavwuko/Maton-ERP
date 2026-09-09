import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, Modal, NumberInput, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createShift, listShifts, updateShift } from '../../api/hr';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import type { Shift } from './types';

export function ShiftsPanel() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);

  const {
    data: shifts,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['shifts'], queryFn: () => listShifts() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shifts'] });

  const createForm = useForm({
    initialValues: { organizationId: '', name: '', startTime: '09:00', endTime: '17:00', breakMinutes: 0 },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const editForm = useForm({ initialValues: { name: '', startTime: '', endTime: '', breakMinutes: 0 } });

  const createMutation = useMutation({
    mutationFn: createShift,
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Shift created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create shift', color: 'red' }),
  });

  const updateMutation = useMutation({
    mutationFn: (values: typeof editForm.values) => updateShift(editing!.id, values),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Shift updated', color: 'green' });
      setEditing(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update shift', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={4}>Shifts</Title>
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          New shift
        </Button>
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load shifts">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {shifts && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Start</Table.Th>
              <Table.Th>End</Table.Th>
              <Table.Th>Break (min)</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shifts.map((shift) => (
              <Table.Tr key={shift.id}>
                <Table.Td>{shift.name}</Table.Td>
                <Table.Td>{shift.startTime}</Table.Td>
                <Table.Td>{shift.endTime}</Table.Td>
                <Table.Td>{shift.breakMinutes}</Table.Td>
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                      setEditing(shift);
                      editForm.setValues({
                        name: shift.name,
                        startTime: shift.startTime,
                        endTime: shift.endTime,
                        breakMinutes: shift.breakMinutes,
                      });
                    }}
                  >
                    Edit
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {shifts.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No shifts yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New shift">
        <form noValidate onSubmit={createForm.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...createForm.getInputProps('organizationId')} />
            <TextInput label="Name" placeholder="Morning" required {...createForm.getInputProps('name')} />
            <TextInput type="time" label="Start time" required {...createForm.getInputProps('startTime')} />
            <TextInput type="time" label="End time" required {...createForm.getInputProps('endTime')} />
            <NumberInput label="Break (minutes)" min={0} {...createForm.getInputProps('breakMinutes')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title="Edit shift">
        <form noValidate onSubmit={editForm.onSubmit((values) => updateMutation.mutate(values))}>
          <Stack>
            <TextInput label="Name" required {...editForm.getInputProps('name')} />
            <TextInput type="time" label="Start time" required {...editForm.getInputProps('startTime')} />
            <TextInput type="time" label="End time" required {...editForm.getInputProps('endTime')} />
            <NumberInput label="Break (minutes)" min={0} {...editForm.getInputProps('breakMinutes')} />
            <Group justify="flex-end">
              <Button type="submit" loading={updateMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
