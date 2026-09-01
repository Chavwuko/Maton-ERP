import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Group, List, Loader, Stack, Table, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getEmployee, updateEmploymentStatus } from '../../api/hr';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { StatusMenu } from '../../components/StatusMenu';
import { EMPLOYMENT_STATUS_COLORS, EMPLOYMENT_STATUS_TRANSITIONS, type EmploymentStatus } from './types';

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const canManage = hasRole(role, ['admin', 'hr']);

  const {
    data: employee,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['employees', id],
    queryFn: () => getEmployee(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (employmentStatus: EmploymentStatus) => updateEmploymentStatus(id!, employmentStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', id] });
      notifications.show({ message: 'Employment status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load employee">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!employee) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/hr" size="sm">
          ← All employees
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>
          {employee.employeeNumber} — {employee.jobTitle}
        </Title>
        <StatusMenu
          status={employee.employmentStatus}
          transitions={EMPLOYMENT_STATUS_TRANSITIONS}
          colors={EMPLOYMENT_STATUS_COLORS}
          disabled={!canManage}
          loading={statusMutation.isPending}
          onChange={(status) => statusMutation.mutate(status)}
        />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Hire date</Table.Th>
            <Table.Td>{new Date(employee.hireDate).toLocaleDateString()}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Manager</Table.Th>
            <Table.Td>
              {employee.manager ? (
                <Anchor component={Link} to={`/hr/employees/${employee.manager.id}`}>
                  {employee.manager.employeeNumber} — {employee.manager.jobTitle}
                </Anchor>
              ) : (
                '—'
              )}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Title order={4}>Direct reports</Title>
      {(employee.directReports ?? []).length === 0 ? (
        <div>No direct reports.</div>
      ) : (
        <List>
          {(employee.directReports ?? []).map((report) => (
            <List.Item key={report.id}>
              <Anchor component={Link} to={`/hr/employees/${report.id}`}>
                {report.employeeNumber} — {report.jobTitle}
              </Anchor>
            </List.Item>
          ))}
        </List>
      )}
    </Stack>
  );
}
