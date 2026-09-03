import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Select, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createEmployee, listEmployees } from '../../api/hr';
import { ApiError } from '../../api/client';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { UserSelect } from '../../components/UserSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import {
  EMPLOYEE_GRADE_LABELS,
  EMPLOYMENT_STATUS_COLORS,
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  type EmployeeGrade,
  type EmploymentType,
  type Gender,
} from './types';

const GENDER_OPTIONS = Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }));
const EMPLOYMENT_TYPE_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const EMPLOYEE_GRADE_OPTIONS = Object.entries(EMPLOYEE_GRADE_LABELS).map(([value, label]) => ({ value, label }));

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
    initialValues: {
      organizationId: '',
      userId: '',
      employeeNumber: '',
      jobTitle: '',
      hireDate: '',
      managerId: '',
      dateOfBirth: '',
      gender: '',
      employmentType: '',
      grade: '',
      branch: '',
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      userId: (value) => (value ? null : 'User is required'),
      employeeNumber: (value) => (value.trim() ? null : 'Employee number is required'),
      jobTitle: (value) => (value.trim() ? null : 'Job title is required'),
      hireDate: (value) => (value ? null : 'Hire date is required'),
      dateOfBirth: (value) => (value ? null : 'Date of birth is required'),
      gender: (value) => (value ? null : 'Gender is required'),
      employmentType: (value) => (value ? null : 'Employment type is required'),
      grade: (value) => (value ? null : 'Grade is required'),
      branch: (value) => (value.trim() ? null : 'Branch is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createEmployee({
        ...values,
        hireDate: new Date(values.hireDate).toISOString(),
        dateOfBirth: new Date(values.dateOfBirth).toISOString(),
        managerId: values.managerId || undefined,
        gender: values.gender as Gender,
        employmentType: values.employmentType as EmploymentType,
        grade: values.grade as EmployeeGrade,
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
            <UserSelect required {...form.getInputProps('userId')} />
            <TextInput label="Employee number" placeholder="EMP-001" required {...form.getInputProps('employeeNumber')} />
            <TextInput label="Job title" required {...form.getInputProps('jobTitle')} />
            <TextInput type="date" label="Hire date" required {...form.getInputProps('hireDate')} />
            <TextInput type="date" label="Date of birth" required {...form.getInputProps('dateOfBirth')} />
            <Select label="Gender" data={GENDER_OPTIONS} required {...form.getInputProps('gender')} />
            <Select label="Employment type" data={EMPLOYMENT_TYPE_OPTIONS} required {...form.getInputProps('employmentType')} />
            <Select label="Grade" data={EMPLOYEE_GRADE_OPTIONS} required {...form.getInputProps('grade')} />
            <TextInput label="Branch" placeholder="Lagos HQ" required {...form.getInputProps('branch')} />
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
