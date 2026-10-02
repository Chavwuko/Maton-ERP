import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { listExpenseRequests, updateExpenseRequestStatus } from '../../api/hr';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import { StatusMenu } from '../../components/StatusMenu';
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_REQUEST_STATUS_COLORS,
  EXPENSE_REQUEST_TRANSITIONS,
  type ExpenseRequestStatus,
} from './types';

export function TeamExpenseRequestsPanel() {
  const queryClient = useQueryClient();
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null);

  const {
    data: requests,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['expense-requests', { employeeId: employeeFilter }],
    queryFn: () => listExpenseRequests({ employeeId: employeeFilter ?? undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ExpenseRequestStatus }) => updateExpenseRequestStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-requests'] });
      notifications.show({ message: 'Status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={500}>Team requests</Text>
      </Group>

      <EmployeeSelect label="Filter by employee" value={employeeFilter} onChange={setEmployeeFilter} clearable />

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load expense requests">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {requests && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Employee</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Incurred on</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.employee?.employeeNumber}</Table.Td>
                <Table.Td>{EXPENSE_CATEGORY_LABELS[r.category]}</Table.Td>
                <Table.Td>{Number(r.amount).toLocaleString()}</Table.Td>
                <Table.Td>{new Date(r.incurredOn).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  <StatusMenu
                    status={r.status}
                    transitions={EXPENSE_REQUEST_TRANSITIONS}
                    colors={EXPENSE_REQUEST_STATUS_COLORS}
                    loading={statusMutation.isPending && statusMutation.variables?.id === r.id}
                    onChange={(status) => statusMutation.mutate({ id: r.id, status })}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
            {requests.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No expense requests yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
