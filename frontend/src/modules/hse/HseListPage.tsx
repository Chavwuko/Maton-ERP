import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Select, Stack, Table, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createIncident, listIncidents } from '../../api/hse';
import { ApiError } from '../../api/client';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { INCIDENT_STATUS_COLORS, SEVERITY_COLORS, type IncidentSeverity, type IncidentType } from './types';

export function HseListPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: incidents,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['incidents'], queryFn: () => listIncidents() });

  const form = useForm({
    initialValues: {
      organizationId: '',
      title: '',
      type: 'NEAR_MISS' as IncidentType,
      severity: 'LOW' as IncidentSeverity,
      occurredAt: '',
      description: '',
      location: '',
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      title: (value) => (value.trim() ? null : 'Title is required'),
      occurredAt: (value) => (value ? null : 'Occurred-at date is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createIncident({
        ...values,
        occurredAt: new Date(values.occurredAt).toISOString(),
        description: values.description || undefined,
        location: values.location || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      notifications.show({ message: 'Incident reported', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to report incident', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>HSE Incidents</Title>
        <Button onClick={() => setCreateOpen(true)}>Report incident</Button>
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load incidents">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {incidents && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Title</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Severity</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Occurred</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {incidents.map((incident) => (
              <Table.Tr key={incident.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/hse/${incident.id}`}>
                    {incident.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>{incident.type.replace(/_/g, ' ')}</Table.Td>
                <Table.Td>
                  <StatusBadge status={incident.severity} colors={SEVERITY_COLORS} />
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={incident.status} colors={INCIDENT_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{new Date(incident.occurredAt).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))}
            {incidents.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No incidents reported yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Report incident">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Title" placeholder="Slip near loading dock" required {...form.getInputProps('title')} />
            <Group grow>
              <Select
                label="Type"
                data={['INJURY', 'NEAR_MISS', 'ENVIRONMENTAL', 'PROPERTY_DAMAGE', 'SECURITY']}
                allowDeselect={false}
                {...form.getInputProps('type')}
              />
              <Select
                label="Severity"
                data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
                allowDeselect={false}
                {...form.getInputProps('severity')}
              />
            </Group>
            <TextInput type="datetime-local" label="Occurred at" required {...form.getInputProps('occurredAt')} />
            <TextInput label="Location" {...form.getInputProps('location')} />
            <Textarea label="Description" {...form.getInputProps('description')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Report
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
