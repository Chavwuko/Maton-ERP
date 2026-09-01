import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createDepartment, getOrganization, updateDepartment } from '../../api/organizations';
import { useRole } from '../../auth/RoleContext';
import type { Department } from '../../types/api';

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

  const {
    data: org,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['organizations', id],
    queryFn: () => getOrganization(id!),
    enabled: !!id,
  });

  const createForm = useForm({
    initialValues: { code: '', name: '' },
    validate: {
      code: (value) => (value.trim() ? null : 'Code is required'),
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  });

  const editForm = useForm({ initialValues: { code: '', name: '' } });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['organizations', id] });

  const createMutation = useMutation({
    mutationFn: (values: { code: string; name: string }) => createDepartment({ organizationId: id!, ...values }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Department created', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) => {
      notifications.show({
        message: err instanceof ApiError ? err.message : 'Failed to create department',
        color: 'red',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: { code: string; name: string }) => updateDepartment(editing!.id, values),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Department updated', color: 'green' });
      setEditing(null);
    },
    onError: (err) => {
      notifications.show({
        message: err instanceof ApiError ? err.message : 'Failed to update department',
        color: 'red',
      });
    },
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load organization">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!org) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/organizations" size="sm">
          ← All organizations
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>{org.name}</Title>
        {role === 'admin' && <Button onClick={() => setCreateOpen(true)}>New department</Button>}
      </Group>

      <Title order={4}>Departments</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(org.departments ?? []).map((dept) => (
            <Table.Tr key={dept.id}>
              <Table.Td>
                <Badge variant="light">{dept.code}</Badge>
              </Table.Td>
              <Table.Td>{dept.name}</Table.Td>
              <Table.Td>
                {role === 'admin' && (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                      setEditing(dept);
                      editForm.setValues({ code: dept.code, name: dept.name });
                    }}
                  >
                    Rename
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
          {(org.departments ?? []).length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>No departments yet.</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New department">
        <form noValidate onSubmit={createForm.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <TextInput label="Code" placeholder="FIN" required {...createForm.getInputProps('code')} />
            <TextInput label="Name" placeholder="Finance" required {...createForm.getInputProps('name')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title="Rename department">
        <form noValidate onSubmit={editForm.onSubmit((values) => updateMutation.mutate(values))}>
          <Stack>
            <TextInput label="Code" required {...editForm.getInputProps('code')} />
            <TextInput label="Name" required {...editForm.getInputProps('name')} />
            <Group justify="flex-end">
              <Button type="submit" loading={updateMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
