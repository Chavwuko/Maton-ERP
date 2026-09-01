import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Select, Stack, Table, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createWorkOrder, listWorkOrders } from '../../api/maintenance';
import { ApiError } from '../../api/client';
import { AssetSelect } from '../../components/AssetSelect';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { WORK_ORDER_STATUS_COLORS, type WorkOrderPriority, type WorkOrderType } from './types';

export function MaintenanceListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: workOrders,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['work-orders'], queryFn: () => listWorkOrders() });

  const form = useForm({
    initialValues: {
      organizationId: '',
      assetId: '',
      title: '',
      description: '',
      type: 'CORRECTIVE' as WorkOrderType,
      priority: 'MEDIUM' as WorkOrderPriority,
      dueDate: '',
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      assetId: (value) => (value ? null : 'Asset is required'),
      title: (value) => (value.trim() ? null : 'Title is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createWorkOrder({
        ...values,
        description: values.description || undefined,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      notifications.show({ message: 'Work order created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) => {
      notifications.show({
        message: err instanceof ApiError ? err.message : 'Failed to create work order',
        color: 'red',
      });
    },
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Maintenance</Title>
        {hasRole(role, ['admin', 'maintenance']) && <Button onClick={() => setCreateOpen(true)}>New work order</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load work orders">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {workOrders && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Title</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Priority</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Due</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {workOrders.map((wo) => (
              <Table.Tr key={wo.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/maintenance/${wo.id}`}>
                    {wo.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>{wo.type}</Table.Td>
                <Table.Td>{wo.priority}</Table.Td>
                <Table.Td>
                  <StatusBadge status={wo.status} colors={WORK_ORDER_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>{wo.dueDate ? new Date(wo.dueDate).toLocaleDateString() : '—'}</Table.Td>
              </Table.Tr>
            ))}
            {workOrders.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No work orders yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New work order">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <AssetSelect required {...form.getInputProps('assetId')} />
            <TextInput label="Title" placeholder="Replace bearing" required {...form.getInputProps('title')} />
            <Textarea label="Description" {...form.getInputProps('description')} />
            <Select
              label="Type"
              data={['CORRECTIVE', 'PREVENTIVE']}
              allowDeselect={false}
              {...form.getInputProps('type')}
            />
            <Select
              label="Priority"
              data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
              allowDeselect={false}
              {...form.getInputProps('priority')}
            />
            <TextInput type="date" label="Due date" {...form.getInputProps('dueDate')} />
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
