import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createDocument } from '../../api/documentControl';
import { createMyExpenseRequest, getMyExpenseRequests } from '../../api/hr';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_REQUEST_STATUS_COLORS, type ExpenseCategory } from './types';

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

export function MyExpenseRequestsPanel() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: requests,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['expense-requests', 'me'], queryFn: () => getMyExpenseRequests() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expense-requests'] });

  const createForm = useForm({
    initialValues: {
      organizationId: '',
      category: 'TRAVEL' as ExpenseCategory,
      amount: '' as number | string,
      incurredOn: '',
      description: '',
    },
    validate: {
      organizationId: (value) => (value ? null : 'Organization is required'),
      amount: (value) => (value === '' || Number(value) <= 0 ? 'Amount must be positive' : null),
      incurredOn: (value) => (value ? null : 'Date is required'),
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: typeof createForm.values) =>
      createMyExpenseRequest({ ...values, amount: Number(values.amount), description: values.description || undefined }),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Expense request submitted', color: 'green' });
      createForm.reset();
      setCreateOpen(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to submit request', color: 'red' }),
  });

  const attachMutation = useMutation({
    mutationFn: ({ requestId, organizationId, file }: { requestId: string; organizationId: string; file: File }) =>
      createDocument({ organizationId, expenseRequestId: requestId, title: file.name }, file),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: 'Receipt attached', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to attach receipt', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={500}>My requests</Text>
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          New request
        </Button>
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load expense requests">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {requests && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Incurred on</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{EXPENSE_CATEGORY_LABELS[r.category]}</Table.Td>
                <Table.Td>{Number(r.amount).toLocaleString()}</Table.Td>
                <Table.Td>{new Date(r.incurredOn).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  <Badge color={EXPENSE_REQUEST_STATUS_COLORS[r.status]} variant="light">
                    {r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <FileButton
                    onChange={(file) => file && attachMutation.mutate({ requestId: r.id, organizationId: r.organizationId, file })}
                  >
                    {(props) => (
                      <Button variant="subtle" size="xs" loading={attachMutation.isPending} {...props}>
                        Attach receipt
                      </Button>
                    )}
                  </FileButton>
                </Table.Td>
              </Table.Tr>
            ))}
            {requests.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>No expense requests yet.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New expense request">
        <form noValidate onSubmit={createForm.onSubmit((values) => createMutation.mutate(values))}>
          <Stack>
            <OrganizationSelect required {...createForm.getInputProps('organizationId')} />
            <Select label="Category" data={CATEGORY_OPTIONS} required {...createForm.getInputProps('category')} />
            <NumberInput label="Amount" min={0} required {...createForm.getInputProps('amount')} />
            <TextInput type="date" label="Incurred on" required {...createForm.getInputProps('incurredOn')} />
            <TextInput label="Description" {...createForm.getInputProps('description')} />
            <Group justify="flex-end">
              <Button type="submit" loading={createMutation.isPending}>
                Submit
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
