import { Stack, Text } from '@mantine/core';
import { appointmentDate, personName, type Appointment } from './types';

// The bits of an appointment that both the requester's list and the store's
// list show in a table cell.
export function WhenCell({ appointment }: { appointment: Appointment }) {
  return (
    <>
      {appointmentDate(appointment.date)}
      <Text size="xs" c="dimmed">
        {appointment.time}
      </Text>
    </>
  );
}

export function ItemsCell({ appointment }: { appointment: Appointment }) {
  if (appointment.items.length === 0) return <>—</>;
  return (
    <Stack gap={0}>
      {appointment.items.map((line) => (
        <Text key={line.id} size="sm">
          {line.quantity} {line.item.unitOfMeasure} {line.item.name}
        </Text>
      ))}
    </Stack>
  );
}

export function FeedbackCell({ appointment }: { appointment: Appointment }) {
  if (!appointment.feedback && !appointment.issuedNote) return <>—</>;
  return (
    <Stack gap={0}>
      {appointment.feedback && (
        <Text size="sm">
          {appointment.feedback}
          {appointment.feedbackBy && (
            <Text span size="xs" c="dimmed">
              {' '}
              — {personName(appointment.feedbackBy)}
            </Text>
          )}
        </Text>
      )}
      {appointment.issuedNote && (
        <Text size="xs" c="dimmed">
          {appointment.issuedNote}
        </Text>
      )}
    </Stack>
  );
}
