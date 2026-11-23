import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Loader, Stack, Tabs, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getLeaveAccess } from '../../api/leave';
import { useTabParam } from '../../lib/useTabParam';
import { AllLeavePanel } from './AllLeavePanel';
import { ApprovalsPanel } from './ApprovalsPanel';
import { LeaveTypesPanel } from './LeaveTypesPanel';
import { MyLeavePanel } from './MyLeavePanel';
import { OnLeavePanel } from './OnLeavePanel';

// Leave for everyone: file it and follow it, and for the people who decide on
// it (supervisors, department heads, HR, the executive director) the requests
// waiting for them and who is away. Which tabs show comes from the server.
export function LeavePage() {
  const { data: access, isLoading, isError, error } = useQuery({ queryKey: ['leave', 'access'], queryFn: getLeaveAccess });

  const approver = !!access && (access.canViewDashboard || access.awaitingMyDecision > 0);
  const [tab, setTab] = useTabParam(
    ['mine', ...(approver ? ['approvals'] : []), ...(access?.canViewDashboard ? ['on-leave', 'all'] : []), ...(access?.canManageTypes ? ['types'] : [])],
    'mine',
  );

  if (isLoading) return <Loader />;
  if (isError || !access) {
    return (
      <Alert color="red" title="Couldn't load leave">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <Stack>
      <Title order={2}>Leave</Title>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="mine">My leave</Tabs.Tab>
          {approver && (
            <Tabs.Tab value="approvals" rightSection={access.awaitingMyDecision > 0 ? <Badge size="sm">{access.awaitingMyDecision}</Badge> : undefined}>
              Approvals
            </Tabs.Tab>
          )}
          {access.canViewDashboard && <Tabs.Tab value="on-leave">Who is on leave</Tabs.Tab>}
          {access.canViewDashboard && <Tabs.Tab value="all">All requests</Tabs.Tab>}
          {access.canManageTypes && <Tabs.Tab value="types">Leave types</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="mine" pt="md">
          <MyLeavePanel organizationId={access.organizationId} />
        </Tabs.Panel>
        {approver && (
          <Tabs.Panel value="approvals" pt="md">
            <ApprovalsPanel />
          </Tabs.Panel>
        )}
        {access.canViewDashboard && (
          <Tabs.Panel value="on-leave" pt="md">
            <OnLeavePanel />
          </Tabs.Panel>
        )}
        {access.canViewDashboard && (
          <Tabs.Panel value="all" pt="md">
            <AllLeavePanel />
          </Tabs.Panel>
        )}
        {access.canManageTypes && (
          <Tabs.Panel value="types" pt="md">
            <LeaveTypesPanel defaultOrganizationId={access.organizationId} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
