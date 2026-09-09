import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, Loader, Stack, Table } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { clockIn, clockOut, getMyAttendance } from '../../api/hr';
import { ATTENDANCE_STATUS_COLORS } from './types';

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

export function MyAttendancePanel() {
  const queryClient = useQueryClient();

  const {
    data: records,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['attendance', 'me'], queryFn: () => getMyAttendance() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });

  const clockInMutation = useMutation({
    mutationFn: clockIn,
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Clocked in', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to clock in', color: 'red' }),
  });

  const clockOutMutation = useMutation({
    mutationFn: clockOut,
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Clocked out', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to clock out', color: 'red' }),
  });

  const today = records?.find((r) => isToday(r.date));
  const canClockIn = !today?.clockIn;
  const canClockOut = !!today?.clockIn && !today.clockOut;

  return (
    <Stack>
      <Group>
        <Button onClick={() => clockInMutation.mutate()} loading={clockInMutation.isPending} disabled={!canClockIn}>
          Clock In
        </Button>
        <Button
          variant="light"
          onClick={() => clockOutMutation.mutate()}
          loading={clockOutMutation.isPending}
          disabled={!canClockOut}
        >
          Clock Out
        </Button>
      </Group>

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
              <Table.Th>Date</Table.Th>
              <Table.Th>Clock In</Table.Th>
              <Table.Th>Clock Out</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {records.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{new Date(r.date).toLocaleDateString()}</Table.Td>
                <Table.Td>{r.clockIn ? new Date(r.clockIn).toLocaleTimeString() : '—'}</Table.Td>
                <Table.Td>{r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : '—'}</Table.Td>
                <Table.Td>
                  <Badge color={ATTENDANCE_STATUS_COLORS[r.status]} variant="light">
                    {r.status}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
            {records.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>No attendance records yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
