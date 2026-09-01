import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Alert, Anchor, Button, Group, Loader, Modal, Select, Stack, Table, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { ApiError } from '../../api/client';
import { createAppraisal, getAppraisalCycle, updateAppraisalCycleStatus } from '../../api/hr';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusMenu } from '../../components/StatusMenu';
import {
  APPRAISAL_CYCLE_STATUS_COLORS,
  APPRAISAL_CYCLE_TRANSITIONS,
  APPRAISAL_STATUS_COLORS,
  type AppraisalCycleStatus,
  type AppraisalRelationType,
} from './types';

export function AppraisalCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'hr']);

  const {
    data: cycle,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['appraisal-cycles', id],
    queryFn: () => getAppraisalCycle(id!),
    enabled: !!id,
  });

  const createForm = useForm({
    initialValues: {
      employeeId: '',
      reviewers: [{ employeeId: '', relationType: 'MANAGER' as AppraisalRelationType }],
    },
    validate: {
      employeeId: (value) => (value ? null : 'Employee is required'),
      reviewers: {
        employeeId: (value) => (value ? null : 'Reviewer is required'),
      },
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['appraisal-cycles', id] });

  const statusMutation = useMutation({
    mutationFn: (status: AppraisalCycleStatus) => updateAppraisalCycleStatus(id!, status),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  const createAppraisalMutation = useMutation({
    mutationFn: (values: typeof createForm.values) => createAppraisal(id!, values),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Appraisal created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create appraisal', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load appraisal cycle">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!cycle) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/hr/appraisal-cycles" size="sm">
          ← All cycles
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>{cycle.name}</Title>
        <StatusMenu
          status={cycle.status}
          transitions={APPRAISAL_CYCLE_TRANSITIONS}
          colors={APPRAISAL_CYCLE_STATUS_COLORS}
          disabled={!canManage}
          loading={statusMutation.isPending}
          onChange={(status) => statusMutation.mutate(status)}
        />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Start date</Table.Th>
            <Table.Td>{new Date(cycle.startDate).toLocaleDateString()}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>End date</Table.Th>
            <Table.Td>{new Date(cycle.endDate).toLocaleDateString()}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Group justify="space-between">
        <Title order={4}>Appraisals</Title>
        {canManage && cycle.status !== 'CLOSED' && (
          <Button size="xs" onClick={() => setCreateOpen(true)}>
            New appraisal
          </Button>
        )}
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Employee</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Overall rating</Table.Th>
            <Table.Th>Reviewers</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(cycle.appraisals ?? []).map((appraisal) => (
            <Table.Tr key={appraisal.id}>
              <Table.Td>
                <Anchor component={Link} to={`/hr/appraisals/${appraisal.id}`}>
                  {appraisal.employeeId}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <StatusBadge status={appraisal.status} colors={APPRAISAL_STATUS_COLORS} />
              </Table.Td>
              <Table.Td>{appraisal.overallRating ?? '—'}</Table.Td>
              <Table.Td>
                {(appraisal.reviewers ?? []).filter((r) => r.status === 'SUBMITTED').length}/
                {(appraisal.reviewers ?? []).length} submitted
              </Table.Td>
            </Table.Tr>
          ))}
          {(cycle.appraisals ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>No appraisals yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New appraisal" size="lg">
        <form noValidate onSubmit={createForm.onSubmit((values) => createAppraisalMutation.mutate(values))}>
          <Stack>
            <EmployeeSelect label="Subject employee" required {...createForm.getInputProps('employeeId')} />

            <Title order={6}>Reviewers</Title>
            {createForm.values.reviewers.map((_, index) => (
              <Group key={index} align="flex-end">
                <EmployeeSelect
                  style={{ flex: 1 }}
                  {...createForm.getInputProps(`reviewers.${index}.employeeId`)}
                />
                <Select
                  label="Relation"
                  data={['SELF', 'MANAGER', 'PEER', 'SUBORDINATE']}
                  allowDeselect={false}
                  {...createForm.getInputProps(`reviewers.${index}.relationType`)}
                />
                <ActionIcon
                  color="red"
                  variant="subtle"
                  disabled={createForm.values.reviewers.length === 1}
                  onClick={() => createForm.removeListItem('reviewers', index)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Button
              variant="light"
              size="xs"
              onClick={() => createForm.insertListItem('reviewers', { employeeId: '', relationType: 'PEER' })}
            >
              Add reviewer
            </Button>

            <Group justify="flex-end">
              <Button type="submit" loading={createAppraisalMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
