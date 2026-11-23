import { Stack, Tabs, Title } from '@mantine/core';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { useTabParam } from '../../lib/useTabParam';
import { AllAppointmentsPanel } from './AllAppointmentsPanel';
import { BookPanel } from './BookPanel';
import { MyAppointmentsPanel } from './MyAppointmentsPanel';
import { SchedulePanel } from './SchedulePanel';

export function AppointmentsPage() {
  const { role } = useRole();
  const isStore = hasRole(role, ['admin', 'inventory']);
  const isAdmin = hasRole(role, ['admin']);
  const [tab, setTab] = useTabParam(
    ['book', 'mine', ...(isStore ? ['all'] : []), ...(isAdmin ? ['schedule'] : [])],
    'book',
  );

  return (
    <Stack>
      <Title order={2}>Make Request</Title>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="book">New request</Tabs.Tab>
          <Tabs.Tab value="mine">My requests</Tabs.Tab>
          {isStore && <Tabs.Tab value="all">All requests</Tabs.Tab>}
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
