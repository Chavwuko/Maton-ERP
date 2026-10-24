import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ActionIcon, Anchor, Badge, Indicator, Popover, Stack, Text } from '@mantine/core';
import { getNotifications } from '../api/notifications';
import { useRole } from '../auth/RoleContext';
import { hasRole } from '../auth/roleStore';
import { appointmentDate } from '../modules/appointments/types';

// How often the bell re-checks what is waiting.
const REFRESH_MS = 60_000;

// What needs the store's attention right now: sign-up requests (admin) and
// appointments waiting for review. Nothing is shown to anyone else.
export function NotificationBell() {
  const { role } = useRole();
  const isStore = hasRole(role, ['admin', 'inventory']);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: isStore,
    refetchInterval: REFRESH_MS,
  });

  if (!isStore) return null;
  const total = data?.counts.total ?? 0;

  return (
    <Popover width={340} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Indicator label={total > 99 ? '99+' : total} disabled={total === 0} size={16} color="red">
          <ActionIcon variant="subtle" aria-label={total > 0 ? `Notifications, ${total} waiting` : 'Notifications'}>
            🔔
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          {total === 0 && (
            <Text size="sm" c="dimmed">
              Nothing is waiting for you.
            </Text>
          )}

          {data && data.access.length > 0 && (
            <>
              <Text size="sm" fw={600}>
                Sign-up requests
                <Badge ml={6} size="sm" color="yellow">
                  {data.counts.access}
                </Badge>
              </Text>
              {data.access.map((request) => (
                <Anchor key={request.id} component={Link} to="/users?tab=requests" size="sm">
                  {request.name}
                  {!request.submitted && ' (details not sent yet)'}
                </Anchor>
              ))}
            </>
          )}

          {data && data.appointments.length > 0 && (
            <>
              <Text size="sm" fw={600}>
                Appointments to review
                <Badge ml={6} size="sm" color="yellow">
                  {data.counts.appointments}
                </Badge>
              </Text>
              {data.appointments.map((appointment) => (
                <Anchor key={appointment.id} component={Link} to="/appointments?tab=all" size="sm">
                  {appointment.subject} — {appointment.requesterName}, {appointmentDate(appointment.date)} {appointment.time}
                </Anchor>
              ))}
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
