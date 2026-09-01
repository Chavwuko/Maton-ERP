import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createMilestone, getProject, updateMilestone, updateProjectStatus } from '../../api/projects';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { StatusMenu } from '../../components/StatusMenu';
import {
  MILESTONE_STATUS_COLORS,
  MILESTONE_TRANSITIONS,
  PROJECT_STATUS_COLORS,
  PROJECT_TRANSITIONS,
  type MilestoneStatus,
  type ProjectStatus,
} from './types';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = hasRole(role, ['admin', 'project_control']);

  const {
    data: project,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  });

  const createForm = useForm({
    initialValues: { name: '', dueDate: '', description: '' },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
      dueDate: (value) => (value ? null : 'Due date is required'),
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['projects', id] });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProjectStatus(id!, status),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Status updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' }),
  });

  const createMilestoneMutation = useMutation({
    mutationFn: (values: typeof createForm.values) =>
      createMilestone(id!, {
        name: values.name,
        dueDate: new Date(values.dueDate).toISOString(),
        description: values.description || undefined,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Milestone created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create milestone', color: 'red' }),
  });

  const milestoneStatusMutation = useMutation({
    mutationFn: ({ milestoneId, status }: { milestoneId: string; status: MilestoneStatus }) =>
      updateMilestone(id!, milestoneId, { status }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Milestone updated', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update milestone', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load project">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!project) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/projects" size="sm">
          ← All projects
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>
          {project.code} — {project.name}
        </Title>
        <StatusMenu
          status={project.status}
          transitions={PROJECT_TRANSITIONS}
          colors={PROJECT_STATUS_COLORS}
          disabled={!canManage}
          loading={statusMutation.isPending}
          onChange={(status) => statusMutation.mutate(status)}
        />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Start date</Table.Th>
            <Table.Td>{project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>End date</Table.Th>
            <Table.Td>{project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Budget</Table.Th>
            <Table.Td>{project.budget ? Number(project.budget).toLocaleString() : '—'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Group justify="space-between">
        <Title order={4}>Milestones</Title>
        {canManage && <Button size="xs" onClick={() => setCreateOpen(true)}>New milestone</Button>}
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Due</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(project.milestones ?? []).map((milestone) => (
            <Table.Tr key={milestone.id}>
              <Table.Td>{milestone.name}</Table.Td>
              <Table.Td>{new Date(milestone.dueDate).toLocaleDateString()}</Table.Td>
              <Table.Td>
                <StatusMenu
                  status={milestone.status}
                  transitions={MILESTONE_TRANSITIONS}
                  colors={MILESTONE_STATUS_COLORS}
                  disabled={!canManage}
                  loading={
                    milestoneStatusMutation.isPending &&
                    milestoneStatusMutation.variables?.milestoneId === milestone.id
                  }
                  onChange={(status) => milestoneStatusMutation.mutate({ milestoneId: milestone.id, status })}
                />
              </Table.Td>
            </Table.Tr>
          ))}
          {(project.milestones ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>No milestones yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New milestone">
        <form noValidate onSubmit={createForm.onSubmit((values) => createMilestoneMutation.mutate(values))}>
          <Stack>
            <TextInput label="Name" placeholder="Foundation complete" required {...createForm.getInputProps('name')} />
            <TextInput type="date" label="Due date" required {...createForm.getInputProps('dueDate')} />
            <TextInput label="Description" {...createForm.getInputProps('description')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMilestoneMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
