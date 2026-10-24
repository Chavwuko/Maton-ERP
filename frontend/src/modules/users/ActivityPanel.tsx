import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Group, Loader, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { ApiError } from '../../api/client';
import { listActivity } from '../../api/activity';
import { ACTIVITY_ENTITY_TYPES } from './activityTypes';

// Who did what, newest first. Admin only.
export function ActivityPanel() {
  const [entityType, setEntityType] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const {
    data: entries,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['activity', { entityType, from, to }],
    queryFn: () => listActivity({ entityType: entityType ?? undefined, from: from || undefined, to: to || undefined }),
  });

  return (
    <Stack>
      <Group align="flex-end">
        <Select
          label="Kind of record"
          placeholder="Everything"
          clearable
          data={ACTIVITY_ENTITY_TYPES}
          value={entityType}
          onChange={setEntityType}
        />
        <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>

      {isLoading && <Loader />}
      {isError && (
        <Alert color="red" title="Couldn't load the activity log">
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </Alert>
      )}

      {entries && (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Who</Table.Th>
                <Table.Th>What</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>{new Date(entry.createdAt).toLocaleString()}</Table.Td>
                  <Table.Td>
                    {entry.user ? `${entry.user.firstName} ${entry.user.lastName}`.trim() || entry.user.email : 'System'}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{entry.action}</Badge>
                  </Table.Td>
                  <Table.Td>{entry.metadata?.summary ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
              {entries.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>No activity matches.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
          {entries.length >= 200 && (
            <Text size="xs" c="dimmed">
              Showing the latest 200. Narrow by record kind or date to see older entries.
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
