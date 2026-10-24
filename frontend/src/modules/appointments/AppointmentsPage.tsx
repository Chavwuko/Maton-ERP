import { Stack, Tabs, Title } from '@mantine/core';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { AllAppointmentsPanel } from './AllAppointmentsPanel';
import { BookPanel } from './BookPanel';
import { MyAppointmentsPanel } from './MyAppointmentsPanel';
import { SchedulePanel } from './SchedulePanel';

export function AppointmentsPage() {
  const { role } = useRole();
  const isStore = hasRole(role, ['admin', 'inventory']);
  const isAdmin = hasRole(role, ['admin']);

  return (
    <Stack>
      <Title order={2}>Appointments</Title>

      <Tabs defaultValue="book">
        <Tabs.List>
          <Tabs.Tab value="book">Book</Tabs.Tab>
          <Tabs.Tab value="mine">My appointments</Tabs.Tab>
          {isStore && <Tabs.Tab value="all">All appointments</Tabs.Tab>}
          {isAdmin && <Tabs.Tab value="schedule">Schedule</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="book" pt="md">
          <BookPanel />
        </Tabs.Panel>
        <Tabs.Panel value="mine" pt="md">
          <MyAppointmentsPanel />
        </Tabs.Panel>
        {isStore && (
          <Tabs.Panel value="all" pt="md">
            <AllAppointmentsPanel />
          </Tabs.Panel>
        )}
        {isAdmin && (
          <Tabs.Panel value="schedule" pt="md">
            <SchedulePanel />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
