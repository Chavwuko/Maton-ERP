import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Loader, Stack, Table, Text } from '@mantine/core';
import { ApiError } from '../../api/client';
import { PersonCell } from '../../components/PersonCell';
import { listLeaveInbox } from '../../api/leave';
import { DecisionDialog } from './DecisionDialog';
import { LEAVE_STATUS_COLORS, LEAVE_STATUS_LABELS, leaveDate, personName, type LeaveRequest } from './types';

// The requests waiting for this person's decision, oldest first.
export function ApprovalsPanel() {
  const [deciding, setDeciding] = useState<LeaveRequest | null>(null);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['leave', 'inbox'], queryFn: listLeaveInbox });

  return (
    <Stack>
      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load the requests waiting for you">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}
      {data && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Who</Table.Th>
              <Table.Th>Leave</Table.Th>
              <Table.Th>Days</Table.Th>
              <Table.Th>Expected back</Table.Th>
              <Table.Th>Waiting with</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((request) => (
              <Table.Tr key={request.id}>
                <Table.Td>
                  <PersonCell
                    name={personName(request.employee.user)}
                    detail={[request.employee.jobTitle, request.employee.user.department?.name].filter(Boolean).join(', ')}
                  />
                </Table.Td>
                <Table.Td>
                  <Text>{request.leaveType.name}</Text>
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
                  <Button size="compact-xs" aria-label={`Review leave for ${personName(request.employee.user)}`} onClick={() => setDeciding(request)}>
                    Review
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>Nothing is waiting for your decision.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      {deciding && <DecisionDialog request={deciding} opened onClose={() => setDeciding(null)} />}
    </Stack>
  );
}
