import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, Loader, Modal, Select, Stack, Table, Tabs, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { disableUser, enableUser, listUsers, updateUser } from '../../api/users';
import { useRole } from '../../auth/RoleContext';
import { hasRole, ROLES } from '../../auth/roleStore';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import { useTabParam } from '../../lib/useTabParam';
import { ActivityPanel } from './ActivityPanel';
import { AccessRequestsPanel } from './AccessRequestsPanel';
import { AccessSettingsPanel } from './AccessSettingsPanel';
import { EmailSettingsPanel } from './EmailSettingsPanel';
import { USER_STATUS_COLORS, USER_STATUS_LABELS, type User } from './types';

function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<User | null>(null);

  const {
    data: users,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['users', {}], queryFn: () => listUsers() });

  const form = useForm({ initialValues: { roleName: '', departmentId: '' } });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const onError = (fallback: string) => (err: unknown) =>
    notifications.show({ message: err instanceof ApiError ? err.message : fallback, color: 'red' });

  const editMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      updateUser(editing!.id, {
        roleName: values.roleName || undefined,
        departmentId: values.departmentId || undefined,
      }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'User updated', color: 'green' });
      setEditing(null);
    },
    onError: onError('Failed to update user'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ user, enable }: { user: User; enable: boolean }) =>
      enable ? enableUser(user.id) : disableUser(user.id),
    onSuccess: (_data, { enable }) => {
      refresh();
      notifications.show({ message: enable ? 'User enabled' : 'User disabled', color: 'green' });
    },
    onError: onError('Failed to change user status'),
  });

  const openEdit = (user: User) => {
    form.setValues({ roleName: user.role?.name ?? '', departmentId: user.departmentId ?? '' });
    setEditing(user);
  };

  return (
    <Stack>
      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load users">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {users && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Department</Table.Th>
              <Table.Th>Status</Table.Th>
              {isAdmin && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => {
              const name = `${user.firstName} ${user.lastName}`.trim();
              const manageable = user.status === 'ACTIVE' || user.status === 'DISABLED';
              return (
                <Table.Tr key={user.id}>
                  <Table.Td>{name || '—'}</Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>{user.role?.name ?? '—'}</Table.Td>
                  <Table.Td>{user.department?.name ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={USER_STATUS_COLORS[user.status]} variant="light">
                      {USER_STATUS_LABELS[user.status]}
                    </Badge>
                  </Table.Td>
                  {isAdmin && (
                    <Table.Td>
                      {manageable && (
                        <Group gap="xs" wrap="nowrap">
                          <Button size="compact-xs" variant="subtle" onClick={() => openEdit(user)}>
                            Edit
                          </Button>
                          {user.status === 'ACTIVE' ? (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              onClick={() => statusMutation.mutate({ user, enable: false })}
                            >
                              Disable
                            </Button>
                          ) : (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              onClick={() => statusMutation.mutate({ user, enable: true })}
                            >
                              Enable
                            </Button>
                          )}
                        </Group>
                      )}
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
            {users.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={isAdmin ? 6 : 5}>No users yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.email ?? ''}`}>
        <form noValidate onSubmit={form.onSubmit((values) => editMutation.mutate(values))}>
          <Stack>
            <Select
              label="Role"
              data={ROLES.map((role) => ({ value: role, label: role }))}
              allowDeselect={false}
              {...form.getInputProps('roleName')}
            />
            <DepartmentSelect {...form.getInputProps('departmentId')} />
            <Group justify="flex-end">
              <Button type="submit" loading={editMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

export function UsersListPage() {
  const { role } = useRole();
  const isAdmin = hasRole(role, ['admin']);
  const [tab, setTab] = useTabParam(['users', ...(isAdmin ? ['requests', 'settings', 'activity'] : [])], 'users');

  // Same query the requests tab runs, so the badge and the tab agree.
  const { data: pending } = useQuery({
    queryKey: ['users', { status: 'PENDING' }],
    queryFn: () => listUsers({ status: 'PENDING' }),
    enabled: isAdmin,
  });

  return (
    <Stack>
      <Title order={2}>Users</Title>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          {isAdmin && (
            <Tabs.Tab
              value="requests"
              rightSection={
                pending && pending.length > 0 ? (
                  <Badge size="sm" circle color="yellow" aria-label={`${pending.length} pending requests`}>
                    {pending.length}
                  </Badge>
                ) : undefined
              }
            >
              Access requests
            </Tabs.Tab>
          )}
          {isAdmin && <Tabs.Tab value="settings">Settings</Tabs.Tab>}
          {isAdmin && <Tabs.Tab value="activity">Activity log</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="users" pt="md">
          <UsersTab isAdmin={isAdmin} />
        </Tabs.Panel>
        {isAdmin && (
          <Tabs.Panel value="requests" pt="md">
            <AccessRequestsPanel />
          </Tabs.Panel>
        )}
        {isAdmin && (
          <Tabs.Panel value="settings" pt="md">
            <Stack gap="xl">
              <AccessSettingsPanel />
              <EmailSettingsPanel />
            </Stack>
          </Tabs.Panel>
        )}
        {isAdmin && (
          <Tabs.Panel value="activity" pt="md">
            <ActivityPanel />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
