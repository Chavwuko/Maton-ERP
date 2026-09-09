import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, Loader, Modal, Select, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createAttendanceRecord, listAttendance, updateAttendanceRecord } from '../../api/hr';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import { ATTENDANCE_STATUS_COLORS, type AttendanceRecord, type AttendanceStatus } from './types';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'HOLIDAY', label: 'Holiday' },
];

export function TeamAttendancePanel() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null);

  const {
    data: records,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['attendance', { employeeId: employeeFilter }],
    queryFn: () => listAttendance({ employeeId: employeeFilter ?? undefined }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });

  const createForm = useForm({
    initialValues: { employeeId: '', date: '', status: 'ABSENT' as AttendanceStatus, notes: '' },
    validate: {
      employeeId: (value) => (value ? null : 'Employee is required'),
      date: (value) => (value ? null : 'Date is required'),
    },
  });

  const editForm = useForm({ initialValues: { status: 'PRESENT' as AttendanceStatus, notes: '' } });

  const createMutation = useMutation({
    mutationFn: (values: typeof createForm.values) =>
      createAttendanceRecord({ ...values, notes: values.notes || undefined }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Attendance record created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create record', color: 'red' }),
  });

  const updateMutation = useMutation({
    mutationFn: (values: typeof editForm.values) =>
      updateAttendanceRecord(editing!.id, { ...values, notes: values.notes || undefined }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Attendance record updated', color: 'green' });
      setEditing(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update record', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={4}>Team attendance</Title>
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          Mark attendance
        </Button>
      </Group>

      <EmployeeSelect label="Filter by employee" value={employeeFilter} onChange={setEmployeeFilter} clearable />

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load attendance">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {records && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Employee</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Clock In</Table.Th>
              <Table.Th>Clock Out</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {records.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.employee?.employeeNumber}</Table.Td>
                <Table.Td>{new Date(r.date).toLocaleDateString()}</Table.Td>
                <Table.Td>{r.clockIn ? new Date(r.clockIn).toLocaleTimeString() : '—'}</Table.Td>
                <Table.Td>{r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : '—'}</Table.Td>
                <Table.Td>
                  <Badge color={ATTENDANCE_STATUS_COLORS[r.status]} variant="light">
                    {r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                      setEditing(r);
                      editForm.setValues({ status: r.status, notes: r.notes ?? '' });
                    }}
                  >
                    Correct
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {records.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>No attendance records yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Mark attendance">
        <form noValidate onSubmit={createForm.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <EmployeeSelect required {...createForm.getInputProps('employeeId')} />
            <TextInput type="date" label="Date" required {...createForm.getInputProps('date')} />
            <Select label="Status" data={STATUS_OPTIONS} required {...createForm.getInputProps('status')} />
            <TextInput label="Notes" {...createForm.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title="Correct attendance record">
        <form noValidate onSubmit={editForm.onSubmit((values) => updateMutation.mutate(values))}>
          <Stack>
            <Select label="Status" data={STATUS_OPTIONS} required {...editForm.getInputProps('status')} />
            <TextInput label="Notes" {...editForm.getInputProps('notes')} />
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
