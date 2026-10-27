import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Loader, Modal, NumberInput, Stack, Table, Textarea, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { assignWorkOrder, getWorkOrder, updateWorkOrderStatus } from '../../api/maintenance';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { StatusMenu } from '../../components/StatusMenu';
import { UserSelect } from '../../components/UserSelect';
import { formatMoney } from '../inventory/format';
import { WORK_ORDER_STATUS_COLORS, WORK_ORDER_TRANSITIONS, type WorkOrderStatus } from './types';

export function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const {
    data: workOrder,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => getWorkOrder(id!),
    enabled: !!id,
  });

  const assignForm = useForm({
    initialValues: { assignedToId: '' },
    validate: { assignedToId: (value) => (value ? null : 'Assignee is required') },
  });

  // What was done and what it cost, asked for when finishing the job.
  const completeForm = useForm({
    initialValues: { completionNotes: '', cost: '' as number | string },
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, details }: { status: WorkOrderStatus; details?: { completionNotes?: string; cost?: number } }) =>
      details ? updateWorkOrderStatus(id!, status, details) : updateWorkOrderStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      // Completing moves its schedule on and adds to the asset's service history.
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      notifications.show({ message: 'Status updated', color: 'green' });
      setCompleteOpen(false);
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to update status', color: 'red' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (values: typeof assignForm.values) => assignWorkOrder(id!, values.assignedToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders', id] });
      notifications.show({ message: 'Work order assigned', color: 'green' });
      setAssignOpen(false);
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to assign', color: 'red' });
    },
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load work order">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!workOrder) return null;

  const canManage = hasRole(role, ['admin', 'maintenance']);

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/maintenance" size="sm">
          ← All work orders
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>{workOrder.title}</Title>
        <StatusMenu
          status={workOrder.status}
          transitions={WORK_ORDER_TRANSITIONS}
          colors={WORK_ORDER_STATUS_COLORS}
          disabled={!canManage}
          loading={statusMutation.isPending}
          onChange={(status) => (status === 'COMPLETED' ? setCompleteOpen(true) : statusMutation.mutate({ status }))}
        />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Asset</Table.Th>
            <Table.Td>
              <Anchor component={Link} to={`/assets/${workOrder.assetId}`}>
                View asset
              </Anchor>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            <Table.Td>
              <Group gap="xs">
                {workOrder.type}
                {workOrder.scheduleId && (
                  <Anchor component={Link} to="/maintenance/schedules" size="sm">
                    <Badge variant="light" style={{ cursor: 'pointer' }}>
                      From a schedule
                    </Badge>
                  </Anchor>
                )}
              </Group>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Priority</Table.Th>
            <Table.Td>{workOrder.priority}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Description</Table.Th>
            <Table.Td>{workOrder.description ?? '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Due date</Table.Th>
            <Table.Td>{workOrder.dueDate ? new Date(workOrder.dueDate).toLocaleDateString() : '—'}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Assigned to</Table.Th>
            <Table.Td>
              <Group gap="xs">
                {workOrder.assignedToId ?? 'Unassigned'}
                {canManage && (
                  <Button variant="subtle" size="xs" onClick={() => setAssignOpen(true)}>
                    Reassign
                  </Button>
                )}
              </Group>
            </Table.Td>
          </Table.Tr>
          {workOrder.status === 'COMPLETED' && (
            <>
              <Table.Tr>
                <Table.Th>What was done</Table.Th>
                <Table.Td>{workOrder.completionNotes ?? '—'}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Cost</Table.Th>
                <Table.Td>{workOrder.cost == null ? '—' : formatMoney(workOrder.cost)}</Table.Td>
              </Table.Tr>
            </>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={completeOpen} onClose={() => setCompleteOpen(false)} title="Complete work order">
        <form
          noValidate
          onSubmit={completeForm.onSubmit((values) =>
            statusMutation.mutate({
              status: 'COMPLETED',
              details: {
                completionNotes: values.completionNotes.trim() || undefined,
                cost: values.cost === '' ? undefined : Number(values.cost),
              },
            }),
          )}
        >
          <Stack>
            <Textarea label="What was done" placeholder="Replaced the seal" {...completeForm.getInputProps('completionNotes')} />
            <NumberInput label="Cost" description="Labour and outside costs, if you know them" min={0} allowNegative={false} decimalScale={2} {...completeForm.getInputProps('cost')} />
            <Group justify="flex-end">
              <Button type="submit" loading={statusMutation.isPending}>
                Complete
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={assignOpen} onClose={() => setAssignOpen(false)} title="Assign work order">
        <form noValidate onSubmit={assignForm.onSubmit((values) => assignMutation.mutate(values))}>
          <Stack>
            <UserSelect label="Assigned to" required {...assignForm.getInputProps('assignedToId')} />
            <Group justify="flex-end">
              <Button type="submit" loading={assignMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
