import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { deleteSchedule, generateDueWorkOrders, listSchedules, updateSchedule } from '../../api/maintenance';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { assetDate } from '../assets/types';
import { ScheduleDialog } from './ScheduleDialog';
import { DUE_STATUS_COLORS, intervalLabel, type DueStatus, type MaintenanceSchedule } from './types';

const STATUS_FILTERS: { value: DueStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All schedules' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'DUE_SOON', label: 'Due soon' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'PAUSED', label: 'Paused' },
];

const personName = (person: { firstName: string; lastName: string; email: string }) =>
  `${person.firstName} ${person.lastName}`.trim() || person.email;

// Recurring maintenance, and what is due when. A schedule opens a preventive
// work order ahead of each due date; finishing that work order moves the
// schedule on.
export function SchedulesPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const canManage = hasRole(role, ['admin', 'maintenance']);
  const [filter, setFilter] = useState<DueStatus | 'ALL'>('ALL');
  const [dialog, setDialog] = useState<{ schedule?: MaintenanceSchedule } | null>(null);

  const {
    data: schedules,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => listSchedules() });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
  };
  const failure = (fallback: string) => (err: unknown) =>
    notifications.show({ message: err instanceof ApiError ? err.message : fallback, color: 'red' });

  const generate = useMutation({
    mutationFn: generateDueWorkOrders,
    onSuccess: ({ created }) => {
      refresh();
      notifications.show({
        message: created === 0 ? 'Nothing is due right now' : `${created} work order${created === 1 ? '' : 's'} opened`,
        color: 'green',
      });
    },
    onError: failure('Failed to open work orders'),
  });

  const toggle = useMutation({
    mutationFn: (schedule: MaintenanceSchedule) => updateSchedule(schedule.id, { active: !schedule.active }),
    onSuccess: (_, schedule) => {
      refresh();
      notifications.show({ message: schedule.active ? 'Schedule paused' : 'Schedule resumed', color: 'green' });
    },
    onError: failure('Failed to update schedule'),
  });

  const remove = useMutation({
    mutationFn: (schedule: MaintenanceSchedule) => deleteSchedule(schedule.id),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Schedule deleted', color: 'green' });
    },
    onError: failure('Failed to delete schedule'),
  });

  const shown = (schedules ?? []).filter((schedule) => filter === 'ALL' || schedule.dueStatus === filter);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Maintenance schedules</Title>
        {canManage && (
          <Group>
            <Button variant="light" loading={generate.isPending} onClick={() => generate.mutate()}>
              Open due work orders
            </Button>
            <Button onClick={() => setDialog({})}>New schedule</Button>
          </Group>
        )}
      </Group>

      <Select
        label="Show"
        w={220}
        data={STATUS_FILTERS}
        value={filter}
        allowDeselect={false}
        onChange={(value) => setFilter((value as DueStatus | 'ALL') ?? 'ALL')}
      />

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load schedules">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {schedules && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Task</Table.Th>
              <Table.Th>Asset</Table.Th>
              <Table.Th>Repeats</Table.Th>
              <Table.Th>Next due</Table.Th>
              <Table.Th>Last done</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Assigned to</Table.Th>
              {canManage && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((schedule) => (
              <Table.Tr key={schedule.id}>
                <Table.Td>
                  <Text fw={500}>{schedule.title}</Text>
                  <Text size="xs" c="dimmed">
                    {schedule.priority} priority
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/assets/${schedule.asset.id}`}>
                    {schedule.asset.assetTag} — {schedule.asset.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  {intervalLabel(schedule.intervalValue, schedule.intervalUnit)}
                  <Text size="xs" c="dimmed">
                    {schedule.basis === 'FIXED' ? 'fixed calendar' : 'after each job'}
                  </Text>
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{assetDate(schedule.nextDueDate)}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{assetDate(schedule.lastCompletedDate)}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Badge color={DUE_STATUS_COLORS[schedule.dueStatus]} variant="light">
                    {schedule.dueStatus.replace(/_/g, ' ')}
                  </Badge>
                </Table.Td>
                <Table.Td>{schedule.assignedTo ? personName(schedule.assignedTo) : 'Maintenance team'}</Table.Td>
                {canManage && (
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button variant="subtle" size="xs" aria-label={`Edit ${schedule.title}`} onClick={() => setDialog({ schedule })}>
                        Edit
                      </Button>
                      <Button
                        variant="subtle"
                        size="xs"
                        aria-label={`${schedule.active ? 'Pause' : 'Resume'} ${schedule.title}`}
                        loading={toggle.isPending && toggle.variables?.id === schedule.id}
                        onClick={() => toggle.mutate(schedule)}
                      >
                        {schedule.active ? 'Pause' : 'Resume'}
                      </Button>
                      {hasRole(role, ['admin']) && (
                        <Button
                          variant="subtle"
                          size="xs"
                          color="red"
                          aria-label={`Delete ${schedule.title}`}
                          onClick={() => {
                            if (window.confirm(`Delete the schedule "${schedule.title}"? Work orders it already opened are kept.`)) {
                              remove.mutate(schedule);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {shown.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={canManage ? 8 : 7}>
                  {schedules.length === 0 ? 'No maintenance schedules yet.' : 'Nothing matches that filter.'}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      {/* Mounted only while open so each starts from the schedule's current values. */}
      {dialog && <ScheduleDialog opened schedule={dialog.schedule} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
