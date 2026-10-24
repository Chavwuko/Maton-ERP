import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Loader, Table } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { cancelAppointment, listMyAppointments } from '../../api/appointments';
import { FeedbackCell, ItemsCell, WhenCell } from './AppointmentSummary';
import { APPOINTMENT_STATUS_COLORS, APPOINTMENT_STATUS_LABELS } from './types';

export function MyAppointmentsPanel() {
  const queryClient = useQueryClient();

  const {
    data: appointments,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['appointments', 'mine'], queryFn: listMyAppointments });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-slots'] });
      notifications.show({ message: 'Appointment cancelled', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to cancel appointment', color: 'red' }),
  });

  return (
    <>
      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load your appointments">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {appointments && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Items</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Feedback</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {appointments.map((appointment) => (
              <Table.Tr key={appointment.id}>
                <Table.Td>
                  <WhenCell appointment={appointment} />
                </Table.Td>
                <Table.Td>
                  {appointment.subject}
                  {appointment.type !== 'Other' && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{appointment.type}</div>
                  )}
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
                  {(appointment.status === 'PENDING' || appointment.status === 'APPROVED') && (
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
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {appointments.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>You have no appointments yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
