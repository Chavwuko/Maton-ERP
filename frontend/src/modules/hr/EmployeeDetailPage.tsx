import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, List, Loader, Modal, Select, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getEmployee, updateEmployee, updateEmploymentStatus } from '../../api/hr';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import { StatusMenu } from '../../components/StatusMenu';
import {
  EMPLOYEE_GRADE_LABELS,
  EMPLOYMENT_STATUS_COLORS,
  EMPLOYMENT_STATUS_TRANSITIONS,
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  type EmployeeGrade,
  type EmploymentStatus,
  type EmploymentType,
  type Gender,
} from './types';

const GENDER_OPTIONS = Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }));
const EMPLOYMENT_TYPE_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const EMPLOYEE_GRADE_OPTIONS = Object.entries(EMPLOYEE_GRADE_LABELS).map(([value, label]) => ({ value, label }));

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const canManage = hasRole(role, ['admin', 'hr']);
  const [editOpen, setEditOpen] = useState(false);

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employees', id] });

  const statusMutation = useMutation({
    mutationFn: (employmentStatus: EmploymentStatus) => updateEmploymentStatus(id!, employmentStatus),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Employment status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  const editForm = useForm({
    initialValues: {
      jobTitle: employee?.jobTitle ?? '',
      managerId: employee?.managerId ?? '',
      dateOfBirth: employee?.dateOfBirth?.slice(0, 10) ?? '',
      gender: employee?.gender ?? '',
      employmentType: employee?.employmentType ?? '',
      grade: employee?.grade ?? '',
      branch: employee?.branch ?? '',
    },
  });

  const editMutation = useMutation({
    mutationFn: (values: typeof editForm.values) =>
      updateEmployee(id!, {
        ...values,
        managerId: values.managerId || undefined,
        dateOfBirth: values.dateOfBirth ? new Date(values.dateOfBirth).toISOString() : undefined,
        gender: (values.gender || undefined) as Gender | undefined,
        employmentType: (values.employmentType || undefined) as EmploymentType | undefined,
        grade: (values.grade || undefined) as EmployeeGrade | undefined,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Employee profile updated', color: 'green' });
      setEditOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update profile', color: 'red' }),
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
        <Anchor component={Link} to="/hr/employees" size="sm">
          ← All employees
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>
          {employee.employeeNumber} — {employee.jobTitle}
        </Title>
        <Group gap="xs">
          {canManage && (
            <Button
              variant="light"
              size="xs"
              onClick={() => {
                editForm.setValues({
                  jobTitle: employee.jobTitle,
                  managerId: employee.managerId ?? '',
                  dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? '',
                  gender: employee.gender ?? '',
                  employmentType: employee.employmentType ?? '',
                  grade: employee.grade ?? '',
                  branch: employee.branch ?? '',
                });
                setEditOpen(true);
              }}
            >
              Edit profile
            </Button>
          )}
          <StatusMenu
            status={employee.employmentStatus}
            transitions={EMPLOYMENT_STATUS_TRANSITIONS}
            colors={EMPLOYMENT_STATUS_COLORS}
            disabled={!canManage}
            loading={statusMutation.isPending}
            onChange={(status) => statusMutation.mutate(status)}
          />
        </Group>
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Hire date</Table.Th>
            <Table.Td>{new Date(employee.hireDate).toLocaleDateString()}</Table.Td>
          </Table.Tr>
          {employee.exitDate && (
            <Table.Tr>
              <Table.Th>Exit date</Table.Th>
              <Table.Td>{new Date(employee.exitDate).toLocaleDateString()}</Table.Td>
            </Table.Tr>
          )}
          <Table.Tr>
            <Table.Th>Date of birth</Table.Th>
            <Table.Td>{employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString() : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Gender</Table.Th>
            <Table.Td>{employee.gender ? GENDER_LABELS[employee.gender] : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Employment type</Table.Th>
            <Table.Td>{employee.employmentType ? EMPLOYMENT_TYPE_LABELS[employee.employmentType] : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Grade</Table.Th>
            <Table.Td>{employee.grade ? EMPLOYEE_GRADE_LABELS[employee.grade] : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Branch</Table.Th>
            <Table.Td>{employee.branch ?? '—'}</Table.Td>
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

      <Modal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit employee profile">
        <form noValidate onSubmit={editForm.onSubmit((values) => editMutation.mutate(values))}>
          <Stack>
            <TextInput label="Job title" required {...editForm.getInputProps('jobTitle')} />
            <TextInput type="date" label="Date of birth" {...editForm.getInputProps('dateOfBirth')} />
            <Select label="Gender" data={GENDER_OPTIONS} clearable {...editForm.getInputProps('gender')} />
            <Select
              label="Employment type"
              data={EMPLOYMENT_TYPE_OPTIONS}
              clearable
              {...editForm.getInputProps('employmentType')}
            />
            <Select label="Grade" data={EMPLOYEE_GRADE_OPTIONS} clearable {...editForm.getInputProps('grade')} />
            <TextInput label="Branch" placeholder="Lagos HQ" {...editForm.getInputProps('branch')} />
            <EmployeeSelect label="Manager" {...editForm.getInputProps('managerId')} />
            <Group justify="flex-end">
              <Button type="submit" loading={editMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
