import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { cancelAppointment, listAppointments, reviewAppointment } from '../../api/appointments';
import { getStockOverview } from '../../api/inventory';
import { ProjectSelect } from '../../components/ProjectSelect';
import { WarehouseSelect } from '../../components/WarehouseSelect';
import { formatQty } from '../inventory/format';
import { FeedbackCell, ItemsCell, WhenCell } from './AppointmentSummary';
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  personName,
  type Appointment,
  type AppointmentStatus,
} from './types';

type Decision = 'APPROVED' | 'DECLINED' | 'COMPLETED';

const DECISION_LABELS: Record<Decision, string> = {
  APPROVED: 'Approve',
  DECLINED: 'Decline',
  COMPLETED: 'Complete (hand over items)',
};

const DECISION_DONE: Record<Decision, string> = {
  APPROVED: 'approved',
  DECLINED: 'declined',
  COMPLETED: 'completed',
};

interface IssueLine {
  itemId: string;
  label: string;
  unit: string;
  quantity: number | string;
}

// The store's view: every appointment, with review (approve / decline /
// complete) and cancel. Completing is where stock actually leaves.
export function AllAppointmentsPanel() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reviewing, setReviewing] = useState<Appointment | null>(null);

  const {
    data: appointments,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['appointments', 'all', { status, from, to }],
    queryFn: () =>
      listAppointments({
        status: (status as AppointmentStatus | null) ?? undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const { data: stock } = useQuery({
    queryKey: ['stock-overview'],
    queryFn: () => getStockOverview(),
    enabled: !!reviewing,
  });
  const onHand = new Map((stock ?? []).map((row) => [row.id, row.totalOnHand]));

  const form = useForm({
    initialValues: {
      decision: 'APPROVED' as Decision,
      feedback: '',
      warehouseId: '',
      projectId: '',
      lines: [] as IssueLine[],
    },
    validate: {
      feedback: (value, values) =>
        values.decision !== 'APPROVED' && !value.trim() ? 'Please add feedback for the requester' : null,
      warehouseId: (value, values) =>
        values.decision === 'COMPLETED' && values.lines.length > 0 && !value ? 'Choose the warehouse to issue from' : null,
      projectId: (value, values) =>
        values.decision === 'COMPLETED' && values.lines.length > 0 && !value && !reviewing?.department
          ? 'This requester has no department. Choose a project / job to charge the items to'
          : null,
    },
  });

  const openReview = (appointment: Appointment) => {
    form.setValues({
      decision: appointment.status === 'PENDING' ? 'APPROVED' : 'COMPLETED',
      feedback: '',
      warehouseId: '',
      projectId: '',
      lines: appointment.items.map((line) => ({
        itemId: line.itemId,
        label: `${line.item.sku} — ${line.item.name}`,
        unit: line.item.unitOfMeasure,
        quantity: line.quantity,
      })),
    });
    form.resetDirty();
    setReviewing(appointment);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['appointment-slots'] });
  };

  const reviewMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      reviewAppointment(reviewing!.id, {
        decision: values.decision,
        feedback: values.feedback || undefined,
        ...(values.decision === 'COMPLETED'
          ? {
              warehouseId: values.warehouseId || undefined,
              projectId: values.projectId || undefined,
              issue: values.lines
                .filter((line) => Number(line.quantity) > 0)
                .map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) })),
            }
          : {}),
      }),
    onSuccess: (_data, values) => {
      refresh();
      if (values.decision === 'COMPLETED') {
        queryClient.invalidateQueries({ queryKey: ['stock-overview'] });
        queryClient.invalidateQueries({ queryKey: ['consumptions'] });
        queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
      }
      notifications.show({ message: `Appointment ${DECISION_DONE[values.decision]}`, color: 'green' });
      setReviewing(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to review appointment', color: 'red' }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Appointment cancelled', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to cancel appointment', color: 'red' }),
  });

  const decisions: Decision[] = reviewing?.status === 'APPROVED' ? ['DECLINED', 'COMPLETED'] : ['APPROVED', 'DECLINED', 'COMPLETED'];

  return (
    <Stack>
      <Group align="flex-end">
        <Select
          label="Status"
          placeholder="All statuses"
          clearable
          data={(Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[]).map((value) => ({
            value,
            label: APPOINTMENT_STATUS_LABELS[value],
          }))}
          value={status}
          onChange={setStatus}
        />
        <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load appointments">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {appointments && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Requester</Table.Th>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Items</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Feedback</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {appointments.map((appointment) => {
              const open = appointment.status === 'PENDING' || appointment.status === 'APPROVED';
              return (
                <Table.Tr key={appointment.id}>
                  <Table.Td>
                    <WhenCell appointment={appointment} />
                  </Table.Td>
                  <Table.Td>
                    {personName(appointment.requester)}
                    <Text size="xs" c="dimmed">
                      {appointment.department?.name ?? 'No department'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {appointment.subject}
                    <Text size="xs" c="dimmed">
                      {appointment.type}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <ItemsCell appointment={appointment} />
                  </Table.Td>
                  <Table.Td>
                    <Badge color={APPOINTMENT_STATUS_COLORS[appointment.status]} variant="light">
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <FeedbackCell appointment={appointment} />
                  </Table.Td>
                  <Table.Td>
                    {open && (
                      <Group gap="xs" wrap="nowrap">
                        <Button size="compact-xs" onClick={() => openReview(appointment)}>
                          Review
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            if (window.confirm('Cancel this appointment?')) cancelMutation.mutate(appointment.id);
                          }}
                        >
                          Cancel
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {appointments.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>No appointments match.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={!!reviewing}
        onClose={() => setReviewing(null)}
        title={`Review: ${reviewing?.subject ?? ''}`}
        size="lg"
      >
        {reviewing && (
          <form noValidate onSubmit={form.onSubmit((values) => reviewMutation.mutate(values))}>
            <Stack>
              <Text size="sm">
                {personName(reviewing.requester)} · {reviewing.department?.name ?? 'no department'}
                {reviewing.details && (
                  <Text span c="dimmed">
                    {' '}
                    — {reviewing.details}
                  </Text>
                )}
              </Text>

              <Select
                label="Decision"
                data={decisions.map((value) => ({ value, label: DECISION_LABELS[value] }))}
                allowDeselect={false}
                {...form.getInputProps('decision')}
              />
              <Textarea
                label="Feedback for the requester"
                description={form.values.decision === 'APPROVED' ? 'Optional' : 'Required'}
                {...form.getInputProps('feedback')}
              />

              {form.values.decision === 'COMPLETED' && (
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    Items to hand over
                  </Text>
                  {form.values.lines.length === 0 && (
                    <Text size="sm" c="dimmed">
                      No items will be issued.
                    </Text>
                  )}
                  {form.values.lines.map((line, index) => (
                    <Group key={line.itemId} wrap="nowrap" align="flex-start">
                      <div style={{ flex: 1 }}>
                        <Text size="sm">{line.label}</Text>
                        <Text size="xs" c="dimmed">
                          {onHand.has(line.itemId) ? `${formatQty(onHand.get(line.itemId)!)} ${line.unit} on hand` : ' '}
                        </Text>
                      </div>
                      <NumberInput
                        aria-label={`Quantity to issue: ${line.label}`}
                        min={0}
                        decimalScale={3}
                        w={120}
                        {...form.getInputProps(`lines.${index}.quantity`)}
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Do not issue ${line.label}`}
                        onClick={() => form.removeListItem('lines', index)}
                      >
                        ✕
                      </ActionIcon>
                    </Group>
                  ))}
                  <WarehouseSelect label="Issue from" {...form.getInputProps('warehouseId')} />
                  <ProjectSelect
                    label="Charge to project / job"
                    description={
                      reviewing.department
                        ? `Optional. Otherwise charged to ${reviewing.department.name}.`
                        : 'Needed: this requester has no department.'
                    }
                    {...form.getInputProps('projectId')}
                  />
                </Stack>
              )}

              <Group justify="flex-end">
                <Button type="submit" loading={reviewMutation.isPending}>
                  Save decision
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </Stack>
  );
}
