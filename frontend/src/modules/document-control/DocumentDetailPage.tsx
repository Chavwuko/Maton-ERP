import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, FileInput, Group, Loader, Modal, Stack, Table, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { addDocumentVersion, getDocument, getDownloadUrl, recordDecision, submitForReview } from '../../api/documentControl';
import { StatusBadge } from '../../components/StatusBadge';
import { UserMultiSelect } from '../../components/UserMultiSelect';
import { DOCUMENT_STATUS_COLORS } from './types';

const REVIEWER_ROLES = ['document_control', 'admin'];

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [versionOpen, setVersionOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');

  const {
    data: doc,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['documents', id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  });

  const versionForm = useForm({
    initialValues: { file: null as File | null },
    validate: { file: (value) => (value ? null : 'A file is required') },
  });

  const submitForm = useForm({
    initialValues: { reviewerIds: [] as string[] },
    validate: { reviewerIds: (value) => (value.length ? null : 'At least one reviewer is required') },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['documents', id] });

  const versionMutation = useMutation({
    mutationFn: (values: typeof versionForm.values) => addDocumentVersion(id!, values.file!),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'New version uploaded', color: 'green' });
      versionForm.reset();
      setVersionOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof Error ? err.message : 'Failed to upload version', color: 'red' }),
  });

  const submitMutation = useMutation({
    mutationFn: (values: typeof submitForm.values) => submitForReview(id!, values.reviewerIds),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Submitted for review', color: 'green' });
      submitForm.reset();
      setSubmitOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to submit for review', color: 'red' }),
  });

  const decisionMutation = useMutation({
    mutationFn: (status: 'APPROVED' | 'REJECTED') => recordDecision(id!, status, decisionComment || undefined),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Decision recorded', color: 'green' });
      setDecisionComment('');
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to record decision', color: 'red' }),
  });

  const downloadMutation = useMutation({
    mutationFn: (versionId: string) => getDownloadUrl(id!, versionId),
    onSuccess: (result) => window.open(result.url, '_blank'),
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to get download link', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load document">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!doc) return null;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/documents" size="sm">
          ← All documents
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>{doc.title}</Title>
        <StatusBadge status={doc.status} colors={DOCUMENT_STATUS_COLORS} />
      </Group>

      <Group>
        <Button size="xs" onClick={() => setVersionOpen(true)}>
          Upload new version
        </Button>
        {(doc.status === 'DRAFT' || doc.status === 'REJECTED') && (
          <Button size="xs" variant="light" onClick={() => setSubmitOpen(true)}>
            Submit for review
          </Button>
        )}
      </Group>

      {doc.status === 'IN_REVIEW' && (
        <Group>
          <TextInput
            placeholder="Optional comment"
            value={decisionComment}
            onChange={(event) => setDecisionComment(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button color="green" size="xs" onClick={() => decisionMutation.mutate('APPROVED')} loading={decisionMutation.isPending}>
            Approve
          </Button>
          <Button color="red" size="xs" onClick={() => decisionMutation.mutate('REJECTED')} loading={decisionMutation.isPending}>
            Reject
          </Button>
        </Group>
      )}

      <Title order={4}>Versions</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Version</Table.Th>
            <Table.Th>File</Table.Th>
            <Table.Th>Approvals</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(doc.versions ?? []).map((version) => (
            <Table.Tr key={version.id}>
              <Table.Td>v{version.versionNumber}</Table.Td>
              <Table.Td>{version.fileName}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  {(version.approvals ?? []).map((approval) => (
                    <Badge
                      key={approval.id}
                      color={approval.status === 'APPROVED' ? 'green' : approval.status === 'REJECTED' ? 'red' : 'gray'}
                      variant="light"
                    >
                      {approval.status}
                    </Badge>
                  ))}
                </Group>
              </Table.Td>
              <Table.Td>
                <Button variant="subtle" size="xs" onClick={() => downloadMutation.mutate(version.id)}>
                  Download
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={versionOpen} onClose={() => setVersionOpen(false)} title="Upload new version">
        <form noValidate onSubmit={versionForm.onSubmit((values) => versionMutation.mutate(values))}>
          <Stack>
            <FileInput label="File" required {...versionForm.getInputProps('file')} />
            <Group justify="flex-end">
              <Button type="submit" loading={versionMutation.isPending}>
                Upload
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={submitOpen} onClose={() => setSubmitOpen(false)} title="Submit for review">
        <form noValidate onSubmit={submitForm.onSubmit((values) => submitMutation.mutate(values))}>
          <Stack>
            <UserMultiSelect
              label="Reviewers"
              roleFilter={REVIEWER_ROLES}
              required
              {...submitForm.getInputProps('reviewerIds')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={submitMutation.isPending}>
                Submit
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
