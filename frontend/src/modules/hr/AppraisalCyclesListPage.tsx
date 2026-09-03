import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createAppraisalCycle, listAppraisalCycles } from '../../api/hr';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { APPRAISAL_CYCLE_STATUS_COLORS } from './types';

export function AppraisalCyclesListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: cycles,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['appraisal-cycles'], queryFn: () => listAppraisalCycles() });

  const form = useForm({
    initialValues: { organizationId: '', name: '', startDate: '', endDate: '' },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
      startDate: (value) => (value ? null : 'Start date is required'),
      endDate: (value) => (value ? null : 'End date is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createAppraisalCycle({
        organizationId: values.organizationId,
        name: values.name,
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appraisal-cycles'] });
      notifications.show({ message: 'Appraisal cycle created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to create cycle', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Appraisal Cycles</Title>
          <Anchor component={Link} to="/hr/employees" size="sm">
            ← Employees
          </Anchor>
        </div>
        {hasRole(role, ['admin', 'hr']) && <Button onClick={() => setCreateOpen(true)}>New cycle</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load appraisal cycles">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {cycles && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Start</Table.Th>
              <Table.Th>End</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cycles.map((cycle) => (
              <Table.Tr key={cycle.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/hr/appraisal-cycles/${cycle.id}`}>
                    {cycle.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={cycle.status} colors={APPRAISAL_CYCLE_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{new Date(cycle.startDate).toLocaleDateString()}</Table.Td>
                <Table.Td>{new Date(cycle.endDate).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))}
            {cycles.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>No appraisal cycles yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New appraisal cycle">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Name" placeholder="H1 2026" required {...form.getInputProps('name')} />
            <Group grow>
              <TextInput type="date" label="Start date" required {...form.getInputProps('startDate')} />
              <TextInput type="date" label="End date" required {...form.getInputProps('endDate')} />
            </Group>
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
