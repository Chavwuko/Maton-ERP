import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Loader, Stack, Table, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { listUsers } from '../../api/users';

export function UsersListPage() {
  const {
    data: users,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['users', {}], queryFn: () => listUsers() });

  return (
    <Stack>
      <Title order={2}>Users</Title>

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
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => {
              const name = `${user.firstName} ${user.lastName}`.trim();
              return (
                <Table.Tr key={user.id}>
                  <Table.Td>{name || '—'}</Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>{user.role?.name ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={user.isActive ? 'green' : 'gray'} variant="light">
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {users.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>No users yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
