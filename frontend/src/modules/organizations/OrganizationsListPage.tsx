import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { createOrganization, listOrganizations } from '../../api/organizations';
import { useRole } from '../../auth/RoleContext';

export function OrganizationsListPage() {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: organizations,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['organizations'],
    queryFn: listOrganizations,
  });

  const form = useForm({
    initialValues: { name: '' },
    validate: { name: (value) => (value.trim() ? null : 'Name is required') },
  });

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      notifications.show({ message: 'Organization created', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) => {
      notifications.show({
        message: err instanceof ApiError ? err.message : 'Failed to create organization',
        color: 'red',
      });
    },
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Organizations</Title>
        {role === 'admin' && <Button onClick={() => setCreateOpen(true)}>New organization</Button>}
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load organizations">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {organizations && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Departments</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {organizations.map((org) => (
              <Table.Tr key={org.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/organizations/${org.id}`}>
                    {org.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>{org.departments?.length ?? 0}</Table.Td>
                <Table.Td>{new Date(org.createdAt).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))}
            {organizations.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>No organizations yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New organization">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <TextInput label="Name" placeholder="Acme Industrial" required {...form.getInputProps('name')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
