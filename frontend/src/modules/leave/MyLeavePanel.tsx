import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { cancelLeave, getLeaveBalance, listLeaveTypes, listMyLeave } from '../../api/leave';
import { LeaveProgress } from './LeaveProgress';
import { LeaveRequestDialog } from './LeaveRequestDialog';
import { LEAVE_STATUS_COLORS, LEAVE_STATUS_LABELS, leaveDate } from './types';

// The signed-in person's own leave: what they have left, what they have asked
// for, and where each request has got to.
export function MyLeavePanel({ organizationId }: { organizationId: string | null }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);

  const requests = useQuery({ queryKey: ['leave', 'mine'], queryFn: () => listMyLeave() });
  const balance = useQuery({ queryKey: ['leave', 'balance'], queryFn: () => getLeaveBalance(), enabled: !!organizationId });
  const types = useQuery({
    queryKey: ['leave', 'types', { organizationId }],
    queryFn: () => listLeaveTypes({ organizationId: organizationId! }),
    enabled: !!organizationId,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelLeave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      notifications.show({ message: 'Leave request cancelled', color: 'green' });
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to cancel the request', color: 'red' });
    },
  });

  if (!organizationId) {
    return (
      <Alert color="yellow" title="No employee record yet">
        Ask HR to add you as an employee before you file leave.
      </Alert>
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={4}>Your leave this year</Title>
        <Button onClick={() => setAsking(true)} disabled={(types.data ?? []).length === 0}>
          Request leave
        </Button>
      </Group>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Kind of leave</Table.Th>
            <Table.Th ta="right">Allowance</Table.Th>
            <Table.Th ta="right">Taken</Table.Th>
            <Table.Th ta="right">Waiting</Table.Th>
            <Table.Th ta="right">Left</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(balance.data?.balances ?? []).map((entry) => (
            <Table.Tr key={entry.leaveTypeId}>
              <Table.Td>{entry.name}</Table.Td>
              <Table.Td ta="right">{entry.entitlement ?? 'No limit'}</Table.Td>
              <Table.Td ta="right">{entry.used}</Table.Td>
              <Table.Td ta="right">{entry.pending}</Table.Td>
              <Table.Td ta="right">{entry.remaining ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
          {(balance.data?.balances ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>HR has not set up any leave types yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Title order={4}>Your requests</Title>
      {requests.isLoading && <Loader />}
      {requests.isError && (
        <Alert color="red" title="Couldn't load your leave">
          {requests.error instanceof ApiError ? requests.error.message : 'Unknown error'}
        </Alert>
      )}
      {requests.data && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Leave</Table.Th>
              <Table.Th>Days</Table.Th>
              <Table.Th>Expected back</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Progress</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.data.map((request) => (
              <Table.Tr key={request.id}>
                <Table.Td>
                  <Text fw={500}>{request.leaveType.name}</Text>
                  <Text size="xs" c="dimmed">
                    {leaveDate(request.startDate)} to {leaveDate(request.endDate)}
                  </Text>
                </Table.Td>
                <Table.Td>{request.days}</Table.Td>
                <Table.Td>{leaveDate(request.returnDate)}</Table.Td>
                <Table.Td>
                  <Badge color={LEAVE_STATUS_COLORS[request.status]} variant="light">
                    {LEAVE_STATUS_LABELS[request.status]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <LeaveProgress request={request} />
                </Table.Td>
                <Table.Td>
                  {request.status !== 'REJECTED' && request.status !== 'CANCELLED' && (
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      aria-label={`Cancel ${request.leaveType.name} from ${leaveDate(request.startDate)}`}
                      onClick={() => {
                        if (window.confirm('Cancel this leave request?')) cancel.mutate(request.id);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {requests.data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>You have not asked for any leave yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      {/* Mounted only while open so each request starts blank. */}
      {asking && <LeaveRequestDialog opened onClose={() => setAsking(false)} types={types.data ?? []} balances={balance.data?.balances ?? []} />}
    </Stack>
  );
}
