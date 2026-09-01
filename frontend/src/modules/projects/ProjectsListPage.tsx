import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, NumberInput, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createProject, listProjects } from '../../api/projects';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { PROJECT_STATUS_COLORS } from './types';

export function ProjectsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: projects,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() });

  const form = useForm({
    initialValues: { organizationId: '', code: '', name: '', startDate: '', endDate: '', budget: '' as number | string },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      code: (value) => (value.trim() ? null : 'Code is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createProject({
        organizationId: values.organizationId,
        code: values.code,
        name: values.name,
        startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
        endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
        budget: values.budget === '' ? undefined : Number(values.budget),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({ message: 'Project created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create project', color: 'red' });
    },
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Projects</Title>
        {hasRole(role, ['admin', 'project_control']) && <Button onClick={() => setCreateOpen(true)}>New project</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load projects">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {projects && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Code</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Budget</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projects.map((project) => (
              <Table.Tr key={project.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/projects/${project.id}`}>
                    {project.code}
                  </Anchor>
                </Table.Td>
                <Table.Td>{project.name}</Table.Td>
                <Table.Td>
                  <StatusBadge status={project.status} colors={PROJECT_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{project.budget ? Number(project.budget).toLocaleString() : '—'}</Table.Td>
              </Table.Tr>
            ))}
            {projects.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>No projects yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New project">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Code" placeholder="PRJ-001" required {...form.getInputProps('code')} />
            <TextInput label="Name" placeholder="Plant Expansion" required {...form.getInputProps('name')} />
            <Group grow>
              <TextInput type="date" label="Start date" {...form.getInputProps('startDate')} />
              <TextInput type="date" label="End date" {...form.getInputProps('endDate')} />
            </Group>
            <NumberInput label="Budget" placeholder="100000" min={0} {...form.getInputProps('budget')} />
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
