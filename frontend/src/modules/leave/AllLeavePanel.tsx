import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Group, Loader, Select, Stack, Table, Text } from '@mantine/core';
import { ApiError } from '../../api/client';
import { listAllLeave } from '../../api/leave';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import { LeaveProgress } from './LeaveProgress';
import { LEAVE_STATUS_COLORS, LEAVE_STATUS_LABELS, leaveDate, personName, type LeaveStatus } from './types';

const STATUS_OPTIONS = (Object.keys(LEAVE_STATUS_LABELS) as LeaveStatus[]).map((value) => ({ value, label: LEAVE_STATUS_LABELS[value] }));

// Every leave request the viewer oversees: everyone's for HR and the executive
// director, a department's or a team's for its head or supervisor.
export function AllLeavePanel() {
  const [status, setStatus] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['leave', 'all', { status, departmentId }],
    queryFn: () => listAllLeave({ status: (status as LeaveStatus | null) ?? undefined, departmentId: departmentId ?? undefined }),
  });

  return (
    <Stack>
      <Group align="flex-end">
        <Select label="Status" placeholder="Any status" clearable data={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <DepartmentSelect w={240} value={departmentId} onChange={setDepartmentId} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load leave requests">
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
              <Table.Th>Status</Table.Th>
              <Table.Th>Progress</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((request) => (
              <Table.Tr key={request.id}>
                <Table.Td>
                  <Text fw={500}>{personName(request.employee.user)}</Text>
                  <Text size="xs" c="dimmed">
                    {request.employee.user.department?.name ?? '—'}
                  </Text>
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
                  <LeaveProgress request={request} />
                </Table.Td>
              </Table.Tr>
            ))}
            {data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>{status || departmentId ? 'No leave requests match.' : 'No leave requests yet.'}</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
