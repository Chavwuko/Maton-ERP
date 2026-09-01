import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, FileInput, Group, Loader, Modal, Stack, Table, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { createDocument, listDocuments } from '../../api/documentControl';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { DOCUMENT_STATUS_COLORS } from './types';

export function DocumentsListPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: documents,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['documents'], queryFn: () => listDocuments() });

  const form = useForm({
    initialValues: { organizationId: '', title: '', description: '', category: '', file: null as File | null },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      title: (value) => (value.trim() ? null : 'Title is required'),
      file: (value) => (value ? null : 'A file is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      createDocument(
        {
          organizationId: values.organizationId,
          title: values.title,
          description: values.description || undefined,
          category: values.category || undefined,
        },
        values.file!,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      notifications.show({ message: 'Document uploaded', color: 'green' });
      form.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof Error ? err.message : 'Failed to upload document', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Documents</Title>
        <Button onClick={() => setCreateOpen(true)}>Upload document</Button>
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load documents">
          {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      )}

      {documents && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Title</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>Updated</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {documents.map((doc) => (
              <Table.Tr key={doc.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/documents/${doc.id}`}>
                    {doc.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>{doc.category ?? '—'}</Table.Td>
                <Table.Td>
                  <StatusBadge status={doc.status} colors={DOCUMENT_STATUS_COLORS} />
                </Table.Td>
                <Table.Td>v{doc.currentVersion}</Table.Td>
                <Table.Td>{new Date(doc.updatedAt).toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
            {documents.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No documents yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Upload document">
        <form noValidate onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...form.getInputProps('organizationId')} />
            <TextInput label="Title" required {...form.getInputProps('title')} />
            <TextInput label="Category" placeholder="Procedure" {...form.getInputProps('category')} />
            <Textarea label="Description" {...form.getInputProps('description')} />
            <FileInput label="File" required {...form.getInputProps('file')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Upload
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
