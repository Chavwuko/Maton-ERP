import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { approveUser, listUsers, rejectUser } from '../../api/users';
import { ROLES } from '../../auth/roleStore';
import { DepartmentSelect } from '../../components/DepartmentSelect';
import type { User } from './types';

// New sign-ups wait here until an admin decides. Rejected requests stay
// listed (with the reason) so an admin can still change their mind.
export function AccessRequestsPanel() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'PENDING' | 'REJECTED'>('PENDING');
  const [approving, setApproving] = useState<User | null>(null);
  const [rejecting, setRejecting] = useState<User | null>(null);

  const {
    data: requests,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['users', { status: view }], queryFn: () => listUsers({ status: view }) });

  const approveForm = useForm({ initialValues: { roleName: 'staff', departmentId: '' } });
  const rejectForm = useForm({ initialValues: { reason: '' } });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const approveMutation = useMutation({
    mutationFn: (values: typeof approveForm.values) =>
      approveUser(approving!.id, { roleName: values.roleName, departmentId: values.departmentId || undefined }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'User approved', color: 'green' });
      setApproving(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to approve user', color: 'red' }),
  });

  const rejectMutation = useMutation({
    mutationFn: (values: typeof rejectForm.values) =>
      rejectUser(rejecting!.id, { reason: values.reason || undefined }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Request rejected', color: 'green' });
      rejectForm.reset();
      setRejecting(null);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to reject request', color: 'red' }),
  });

  const openApprove = (user: User) => {
    approveForm.setValues({ roleName: 'staff', departmentId: user.departmentId ?? '' });
    setApproving(user);
  };

  return (
    <Stack>
      <SegmentedControl
        value={view}
        onChange={(value) => setView(value as 'PENDING' | 'REJECTED')}
        data={[
          { value: 'PENDING', label: 'Pending' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
        w={220}
      />

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load access requests">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {requests && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Phone</Table.Th>
              <Table.Th>Department</Table.Th>
              <Table.Th>{view === 'PENDING' ? 'Requested' : 'Reason'}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.map((user) => {
              const name = `${user.firstName} ${user.lastName}`.trim();
              return (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    {name || (
                      <Text size="sm" c="dimmed" fs="italic">
                        Details not sent yet
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>{user.phone ?? '—'}</Table.Td>
                  <Table.Td>{user.department?.name ?? '—'}</Table.Td>
                  <Table.Td>
                    {view === 'PENDING'
                      ? user.requestedAt
                        ? new Date(user.requestedAt).toLocaleDateString()
                        : '—'
                      : (user.rejectionReason ?? '—')}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button size="compact-xs" onClick={() => openApprove(user)}>
                        Approve
                      </Button>
                      {view === 'PENDING' && (
                        <Button size="compact-xs" variant="light" color="red" onClick={() => setRejecting(user)}>
                          Reject
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {requests.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  {view === 'PENDING' ? 'No pending requests.' : 'No rejected requests.'}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={!!approving} onClose={() => setApproving(null)} title={`Approve ${approving?.email ?? ''}`}>
        <form noValidate onSubmit={approveForm.onSubmit((values) => approveMutation.mutate(values))}>
          <Stack>
            <Select
              label="Role"
              description="What this person can do once they are in"
              data={ROLES.map((role) => ({ value: role, label: role }))}
              allowDeselect={false}
              required
              {...approveForm.getInputProps('roleName')}
            />
            <DepartmentSelect {...approveForm.getInputProps('departmentId')} />
            <Group justify="flex-end">
              <Button type="submit" loading={approveMutation.isPending}>
                Approve
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.email ?? ''}`}>
        <form noValidate onSubmit={rejectForm.onSubmit((values) => rejectMutation.mutate(values))}>
          <Stack>
            <Textarea
              label="Reason"
              description="Shown to the person on their screen"
              {...rejectForm.getInputProps('reason')}
            />
            <Group justify="flex-end">
              <Button type="submit" color="red" loading={rejectMutation.isPending}>
                Reject request
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
