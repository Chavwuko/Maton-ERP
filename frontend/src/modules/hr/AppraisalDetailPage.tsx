import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, Loader, NumberInput, Stack, Table, Textarea, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getAppraisal, getMyEmployee, submitAppraisalReview } from '../../api/hr';
import { StatusBadge } from '../../components/StatusBadge';
import { APPRAISAL_STATUS_COLORS } from './types';

export function AppraisalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data: appraisal,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['appraisals', id],
    queryFn: () => getAppraisal(id!),
    enabled: !!id,
  });

  // 404s if the current user has no Employee record — that's expected for
  // most roles, so this query is allowed to fail quietly (no error UI).
  const { data: myEmployee } = useQuery({
    queryKey: ['employees', 'me'],
    queryFn: getMyEmployee,
    retry: false,
  });

  const reviewForm = useForm({
    initialValues: { rating: '' as number | string, comments: '' },
    validate: {
      rating: (value) =>
        value === '' || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 5
          ? 'Rating must be an integer between 1 and 5'
          : null,
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (values: typeof reviewForm.values) =>
      submitAppraisalReview(id!, { rating: Number(values.rating), comments: values.comments || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appraisals', id] });
      notifications.show({ message: 'Review submitted', color: 'green' });
      reviewForm.reset();
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to submit review', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load appraisal">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!appraisal) return null;

  const myReview = myEmployee
    ? (appraisal.reviewers ?? []).find((r) => r.reviewerId === myEmployee.id)
    : undefined;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to={`/hr/appraisal-cycles/${appraisal.cycleId}`} size="sm">
          ← Back to cycle
        </Anchor>
      </div>

      <Group justify="space-between">
        <Title order={2}>Appraisal</Title>
        <StatusBadge status={appraisal.status} colors={APPRAISAL_STATUS_COLORS} />
      </Group>

      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th>Employee</Table.Th>
            <Table.Td>{appraisal.employeeId}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Overall rating</Table.Th>
            <Table.Td>{appraisal.overallRating ?? 'Pending — awaiting all reviewers'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Title order={4}>Reviewers</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Relation</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Rating</Table.Th>
            <Table.Th>Comments</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(appraisal.reviewers ?? []).map((reviewer) => (
            <Table.Tr key={reviewer.id}>
              <Table.Td>{reviewer.relationType}</Table.Td>
              <Table.Td>{reviewer.status}</Table.Td>
              <Table.Td>{reviewer.rating ?? '—'}</Table.Td>
              <Table.Td>{reviewer.comments ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {myReview && myReview.status === 'PENDING' && (
        <>
          <Title order={4}>Submit your review</Title>
          <form noValidate onSubmit={reviewForm.onSubmit((values) => reviewMutation.mutate(values))}>
            <Stack maw={400}>
              <NumberInput label="Rating (1–5)" min={1} max={5} required {...reviewForm.getInputProps('rating')} />
              <Textarea label="Comments" {...reviewForm.getInputProps('comments')} />
              <Group justify="flex-end">
                <Button type="submit" loading={reviewMutation.isPending}>
                  Submit review
                </Button>
              </Group>
            </Stack>
          </form>
        </>
      )}
    </Stack>
  );
}
