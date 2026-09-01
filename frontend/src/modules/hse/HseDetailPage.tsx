import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createCorrectiveAction, getIncident, updateCorrectiveAction, updateIncidentStatus } from '../../api/hse';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { StatusMenu } from '../../components/StatusMenu';
import { UserSelect } from '../../components/UserSelect';
import {
  CORRECTIVE_ACTION_STATUS_COLORS,
  CORRECTIVE_ACTION_TRANSITIONS,
  INCIDENT_STATUS_COLORS,
  INCIDENT_TRANSITIONS,
  SEVERITY_COLORS,
  type CorrectiveActionStatus,
  type IncidentStatus,
} from './types';
import { StatusBadge } from '../../components/StatusBadge';

export function HseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'hse']);

  const {
    data: incident,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['incidents', id],
    queryFn: () => getIncident(id!),
    enabled: !!id,
  });

  const createForm = useForm({
    initialValues: { description: '', assignedToId: '', dueDate: '' },
    validate: {
      description: (value) => (value.trim() ? null : 'Description is required'),
      assignedToId: (value) => (value.trim() ? null : 'Assigned-to is required'),
      dueDate: (value) => (value ? null : 'Due date is required'),
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['incidents', id] });

  const statusMutation = useMutation({
    mutationFn: (status: IncidentStatus) => updateIncidentStatus(id!, status),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  const createActionMutation = useMutation({
    mutationFn: (values: typeof createForm.values) =>
      createCorrectiveAction(id!, { ...values, dueDate: new Date(values.dueDate).toISOString() }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Corrective action created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({
        message: err instanceof ApiError ? err.message : 'Failed to create corrective action',
        color: 'red',
      }),
  });

  const actionStatusMutation = useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: CorrectiveActionStatus }) =>
      updateCorrectiveAction(id!, actionId, { status }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Corrective action updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({
        message: err instanceof ApiError ? err.message : 'Failed to update corrective action',
        color: 'red',
      }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load incident">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!incident) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/hse" size="sm">
          ← All incidents
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>{incident.title}</Title>
        <StatusMenu
          status={incident.status}
          transitions={INCIDENT_TRANSITIONS}
          colors={INCIDENT_STATUS_COLORS}
          disabled={!canManage}
          loading={statusMutation.isPending}
          onChange={(status) => statusMutation.mutate(status)}
        />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            <Table.Td>{incident.type.replace(/_/g, ' ')}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Severity</Table.Th>
            <Table.Td>
              <StatusBadge status={incident.severity} colors={SEVERITY_COLORS} />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Occurred at</Table.Th>
            <Table.Td>{new Date(incident.occurredAt).toLocaleString()}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Location</Table.Th>
            <Table.Td>{incident.location ?? '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Description</Table.Th>
            <Table.Td>{incident.description ?? '—'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Group justify="space-between">
        <Title order={4}>Corrective actions</Title>
        {canManage && (
          <Button size="xs" onClick={() => setCreateOpen(true)}>
            New corrective action
          </Button>
        )}
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Description</Table.Th>
            <Table.Th>Due</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(incident.correctiveActions ?? []).map((action) => (
            <Table.Tr key={action.id}>
              <Table.Td>{action.description}</Table.Td>
              <Table.Td>{new Date(action.dueDate).toLocaleDateString()}</Table.Td>
              <Table.Td>
                <StatusMenu
                  status={action.status}
                  transitions={CORRECTIVE_ACTION_TRANSITIONS}
                  colors={CORRECTIVE_ACTION_STATUS_COLORS}
                  disabled={!canManage}
                  loading={actionStatusMutation.isPending && actionStatusMutation.variables?.actionId === action.id}
                  onChange={(status) => actionStatusMutation.mutate({ actionId: action.id, status })}
                />
              </Table.Td>
            </Table.Tr>
          ))}
          {(incident.correctiveActions ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>No corrective actions yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New corrective action">
        <form noValidate onSubmit={createForm.onSubmit((values) => createActionMutation.mutate(values))}>
          <Stack>
            <TextInput label="Description" required {...createForm.getInputProps('description')} />
            <UserSelect label="Assigned to" required {...createForm.getInputProps('assignedToId')} />
            <TextInput type="date" label="Due date" required {...createForm.getInputProps('dueDate')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createActionMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
