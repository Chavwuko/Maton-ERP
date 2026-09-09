import { Stack, Tabs, Title } from '@mantine/core';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { MyAttendancePanel } from './MyAttendancePanel';
import { ShiftsPanel } from './ShiftsPanel';
import { TeamAttendancePanel } from './TeamAttendancePanel';

export function ShiftAttendancePage() {
  const { role } = useRole();
  const canManage = hasRole(role, ['admin', 'hr']);

  return (
    <Stack>
      <Title order={2}>Shift & Attendance</Title>

      <Tabs defaultValue="my-attendance">
        <Tabs.List>
          <Tabs.Tab value="my-attendance">My Attendance</Tabs.Tab>
          {canManage && <Tabs.Tab value="shifts">Shifts</Tabs.Tab>}
          {canManage && <Tabs.Tab value="team">Team Attendance</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="my-attendance" pt="md">
          <MyAttendancePanel />
        </Tabs.Panel>
        {canManage && (
          <Tabs.Panel value="shifts" pt="md">
            <ShiftsPanel />
          </Tabs.Panel>
        )}
        {canManage && (
          <Tabs.Panel value="team" pt="md">
            <TeamAttendancePanel />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
