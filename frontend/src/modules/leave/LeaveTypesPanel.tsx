import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Stack, Switch, Table, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { createDefaultLeaveTypes, createLeaveType, listLeaveTypes, updateLeaveType } from '../../api/leave';
import { OrganizationSelect } from '../../components/OrganizationSelect';
import type { LeaveType } from './types';

function TypeDialog({ organizationId, type, onClose }: { organizationId: string; type?: LeaveType; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      name: type?.name ?? '',
      daysPerYear: (type?.daysPerYear ?? '') as number | string,
      paid: type?.paid ?? true,
      allowBackdate: type?.allowBackdate ?? false,
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
      daysPerYear: (value) => (value === '' || (Number.isInteger(Number(value)) && Number(value) >= 1) ? null : 'Enter a whole number of days, or leave empty for no limit'),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) => {
      const data = {
        name: values.name.trim(),
        daysPerYear: values.daysPerYear === '' ? null : Number(values.daysPerYear),
        paid: values.paid,
        allowBackdate: values.allowBackdate,
      };
      return type ? updateLeaveType(type.id, data) : createLeaveType({ organizationId, ...data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave', 'types'] });
      notifications.show({ message: type ? 'Leave type updated' : 'Leave type added', color: 'green' });
      onClose();
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to save the leave type', color: 'red' });
    },
  });

  return (
    <Modal opened onClose={onClose} title={type ? `Edit ${type.name}` : 'New leave type'}>
      <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <TextInput label="Name" placeholder="Annual leave" required {...form.getInputProps('name')} />
          <NumberInput label="Working days a year" description="Leave empty for no limit" min={1} allowDecimal={false} {...form.getInputProps('daysPerYear')} />
          <Switch label="Paid leave" {...form.getInputProps('paid', { type: 'checkbox' })} />
          <Switch label="Can be filed after it has started" description="For sick or compassionate leave" {...form.getInputProps('allowBackdate', { type: 'checkbox' })} />
          <Group justify="flex-end">
            <Button type="submit" loading={mutation.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// HR sets up the kinds of leave, their yearly allowance, and whether they are paid.
export function LeaveTypesPanel({ defaultOrganizationId }: { defaultOrganizationId: string | null }) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);
  const organizationId = chosen ?? defaultOrganizationId;
  const [dialog, setDialog] = useState<{ type?: LeaveType } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['leave', 'types', { organizationId, all: true }],
    queryFn: () => listLeaveTypes({ organizationId: organizationId!, all: true }),
    enabled: !!organizationId,
  });

  const failure = (fallback: string) => (err: unknown) => notifications.show({ message: err instanceof ApiError ? err.message : fallback, color: 'red' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['leave', 'types'] });

  const defaults = useMutation({
    mutationFn: () => createDefaultLeaveTypes(organizationId!),
    onSuccess: () => {
      refresh();
      notifications.show({ message: 'Standard leave types added', color: 'green' });
    },
    onError: failure('Failed to add the standard leave types'),
  });

  const toggle = useMutation({
    mutationFn: (type: LeaveType) => updateLeaveType(type.id, { active: !type.active }),
    onSuccess: refresh,
    onError: failure('Failed to update the leave type'),
  });

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <OrganizationSelect w={240} value={organizationId} onChange={setChosen} />
        <Group>
          <Button variant="light" disabled={!organizationId} loading={defaults.isPending} onClick={() => defaults.mutate()}>
            Add standard leave types
          </Button>
          <Button disabled={!organizationId} onClick={() => setDialog({})}>
            New leave type
          </Button>
        </Group>
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load leave types">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}
      {!organizationId && <Alert color="blue">Choose an organization to set up its leave types.</Alert>}

      {data && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kind of leave</Table.Th>
              <Table.Th ta="right">Working days a year</Table.Th>
              <Table.Th>Paid</Table.Th>
              <Table.Th>After the fact</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((type) => (
              <Table.Tr key={type.id}>
                <Table.Td>{type.name}</Table.Td>
                <Table.Td ta="right">{type.daysPerYear ?? 'No limit'}</Table.Td>
                <Table.Td>{type.paid ? 'Paid' : 'Unpaid'}</Table.Td>
                <Table.Td>{type.allowBackdate ? 'Allowed' : '—'}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={type.active ? 'green' : 'gray'}>
                    {type.active ? 'In use' : 'Switched off'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Button variant="subtle" size="xs" aria-label={`Edit ${type.name}`} onClick={() => setDialog({ type })}>
                      Edit
                    </Button>
                    <Button variant="subtle" size="xs" aria-label={`${type.active ? 'Switch off' : 'Switch on'} ${type.name}`} onClick={() => toggle.mutate(type)}>
                      {type.active ? 'Switch off' : 'Switch on'}
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>No leave types yet. Add the standard ones to start from.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      {dialog && organizationId && <TypeDialog organizationId={organizationId} type={dialog.type} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
