import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Group, Loader, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getOnLeave } from '../../api/leave';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import { StatCard } from '../../components/StatCard';
import { daysBetween, leaveDate, personName, type LeaveRequest } from './types';

function PeopleTable({ requests, empty, asOf, showBack }: { requests: LeaveRequest[]; empty: string; asOf: string; showBack: boolean }) {
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Who</Table.Th>
          <Table.Th>Department</Table.Th>
          <Table.Th>Leave</Table.Th>
          <Table.Th>From</Table.Th>
          <Table.Th>Last day</Table.Th>
          <Table.Th>Expected back</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {requests.map((request) => {
          const away = daysBetween(asOf, request.returnDate);
          return (
            <Table.Tr key={request.id}>
              <Table.Td>
                <Text fw={500}>{personName(request.employee.user)}</Text>
                <Text size="xs" c="dimmed">
                  {request.employee.jobTitle}
                </Text>
              </Table.Td>
              <Table.Td>{request.employee.user.department?.name ?? '—'}</Table.Td>
              <Table.Td>{request.leaveType.name}</Table.Td>
              <Table.Td>{leaveDate(request.startDate)}</Table.Td>
              <Table.Td>{leaveDate(request.endDate)}</Table.Td>
              <Table.Td>
                <Text>{leaveDate(request.returnDate)}</Text>
                {showBack && (
                  <Badge variant="light" color={away <= 7 ? 'green' : 'gray'} size="sm">
                    {away === 1 ? 'back tomorrow' : `back in ${away} days`}
                  </Badge>
                )}
              </Table.Td>
            </Table.Tr>
          );
        })}
        {requests.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={6}>{empty}</Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );
}

// Who is away, and when each person is expected back. Shown to the executive
// director, HR and department heads (and supervisors, for their own team); the
// server limits it to the people each of them oversees.
export function OnLeavePanel() {
  const [date, setDate] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['leave', 'on-leave', { date, departmentId }],
    queryFn: () => getOnLeave({ date: date || undefined, departmentId: departmentId ?? undefined }),
  });

  return (
    <Stack>
      <Group align="flex-end">
        <TextInput type="date" label="As at" description="Empty means today" value={date} onChange={(event) => setDate(event.currentTarget.value)} />
        <DepartmentSelect w={240} value={departmentId} onChange={setDepartmentId} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load who is on leave">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {data && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <StatCard label="On leave" value={data.counts.onLeave} />
            <StatCard label="Back within a week" value={data.counts.returningThisWeek} />
            <StatCard label="Starting in 30 days" value={data.counts.startingSoon} />
            <StatCard label="Awaiting approval" value={data.counts.awaitingApproval} />
          </SimpleGrid>

          <Title order={4}>On leave on {leaveDate(data.asOf)}</Title>
          <PeopleTable requests={data.onLeave} asOf={data.asOf} showBack empty="Nobody is on leave." />

          <Title order={4}>Starting in the next 30 days</Title>
          <PeopleTable requests={data.upcoming} asOf={data.asOf} showBack={false} empty="Nobody has leave coming up." />
        </>
      )}
    </Stack>
  );
}
