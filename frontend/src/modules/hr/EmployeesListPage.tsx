import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createEmployee, listEmployees } from '../../api/hr';
import { ApiError } from '../../api/client';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { EMPLOYMENT_STATUS_COLORS } from './types';

export function EmployeesListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: employees,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['employees'], queryFn: () => listEmployees() });

  const form = useForm({
    initialValues: { organizationId: '', userId: '', employeeNumber: '', jobTitle: '', hireDate: '', managerId: '' },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      userId: (value) => (value.trim() ? null : 'User id is required'),
      employeeNumber: (value) => (value.trim() ? null : 'Employee number is required'),
      jobTitle: (value) => (value.trim() ? null : 'Job title is required'),
      hireDate: (value) => (value ? null : 'Hire date is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createEmployee({
        ...values,
        hireDate: new Date(values.hireDate).toISOString(),
        managerId: values.managerId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      notifications.show({ message: 'Employee created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create employee', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Employees</Title>
          <Anchor component={Link} to="/hr/appraisal-cycles" size="sm">
            View appraisal cycles →
          </Anchor>
        </div>
        {hasRole(role, ['admin', 'hr']) && <Button onClick={() => setCreateOpen(true)}>New employee</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load employees">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {employees && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Number</Table.Th>
              <Table.Th>Job title</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Hired</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {employees.map((emp) => (
              <Table.Tr key={emp.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/hr/employees/${emp.id}`}>
                    {emp.employeeNumber}
                  </Anchor>
                </Table.Td>
                <Table.Td>{emp.jobTitle}</Table.Td>
                <Table.Td>
                  <StatusBadge status={emp.employmentStatus} colors={EMPLOYMENT_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{new Date(emp.hireDate).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))}
            {employees.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>No employees yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New employee">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput
              label="User id"
              description="User id (UUID) — no user picker yet"
              required
              {...form.getInputProps('userId')}
            />
            <TextInput label="Employee number" placeholder="EMP-001" required {...form.getInputProps('employeeNumber')} />
            <TextInput label="Job title" required {...form.getInputProps('jobTitle')} />
            <TextInput type="date" label="Hire date" required {...form.getInputProps('hireDate')} />
            <EmployeeSelect label="Manager" {...form.getInputProps('managerId')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
