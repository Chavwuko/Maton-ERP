import { Stack, Tabs, Title } from '@mantine/core';
import { useRole } from '../../auth/RoleContext';
import { hasRole } from '../../auth/roleStore';
import { MyExpenseRequestsPanel } from './MyExpenseRequestsPanel';
import { TeamExpenseRequestsPanel } from './TeamExpenseRequestsPanel';

export function ExpenseRequestsPage() {
  const { role } = useRole();
  const canManage = hasRole(role, ['admin', 'hr']);

  return (
    <Stack>
      <Title order={2}>Expense Requests</Title>

      <Tabs defaultValue="my-requests">
        <Tabs.List>
          <Tabs.Tab value="my-requests">My Requests</Tabs.Tab>
          {canManage && <Tabs.Tab value="team">Team Requests</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="my-requests" pt="md">
          <MyExpenseRequestsPanel />
        </Tabs.Panel>
        {canManage && (
          <Tabs.Panel value="team" pt="md">
            <TeamExpenseRequestsPanel />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
