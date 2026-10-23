import type { ReactNode } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Center, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { requestAccess, type Session } from '../api/auth';
import { ApiError } from '../api/client';
import { DepartmentSelect } from '../components/DepartmentSelect';

function Card({ children }: { children: ReactNode }) {
  return (
    <Center h="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={460} maw="100%">
        <Stack>{children}</Stack>
      </Paper>
    </Center>
  );
}

function SignOut({ onSignOut, logoutUrl }: { onSignOut?: () => void; logoutUrl?: string }) {
  return onSignOut ? (
    <Button variant="subtle" size="xs" onClick={onSignOut}>
      Exit sign-up preview
    </Button>
  ) : (
    <Anchor href={logoutUrl} size="sm">
      Log out
    </Anchor>
  );
}

interface ScreenProps {
  session: Session;
  // Local sign-up preview exits instead of logging out of Cognito.
  onSignOut?: () => void;
  logoutUrl?: string;
}

// Shown to someone who has signed up but has not been approved yet. First
// they tell us who they are; after that they just wait (the gate re-checks
// every few seconds, so the app opens by itself once an admin approves).
export function PendingApprovalScreen({ session, onSignOut, logoutUrl }: ScreenProps) {
  const queryClient = useQueryClient();
  const submitted = session.firstName.trim() !== '';
  const [editing, setEditing] = useState(!submitted);

  const form = useForm({
    initialValues: {
      firstName: session.firstName,
      lastName: session.lastName,
      phone: session.phone ?? '',
      departmentId: session.departmentId ?? '',
    },
    validate: {
      firstName: (value) => (value.trim() ? null : 'First name is required'),
      lastName: (value) => (value.trim() ? null : 'Last name is required'),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      requestAccess({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || undefined,
        departmentId: values.departmentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      notifications.show({ message: 'Access request sent', color: 'green' });
      setEditing(false);
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to send request', color: 'red' }),
  });

  return (
    <Card>
      <Group justify="space-between">
        <Title order={3}>{submitted && !editing ? 'Waiting for approval' : 'Request access'}</Title>
        <Badge color="yellow" variant="light">
          Pending
        </Badge>
      </Group>
      <Text size="sm" c="dimmed">
        Signed in as {session.email}
      </Text>

      {editing ? (
        <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
          <Stack>
            <Text size="sm">
              Tell us a little about you. An administrator reviews every request and picks your role.
            </Text>
            <Group grow align="flex-start">
              <TextInput label="First name" required {...form.getInputProps('firstName')} />
              <TextInput label="Last name" required {...form.getInputProps('lastName')} />
            </Group>
            <TextInput label="Phone" {...form.getInputProps('phone')} />
            <DepartmentSelect {...form.getInputProps('departmentId')} />
            <Group justify="space-between">
              <SignOut onSignOut={onSignOut} logoutUrl={logoutUrl} />
              <Button type="submit" loading={mutation.isPending}>
                {submitted ? 'Update request' : 'Send request'}
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <Stack>
          <Alert color="blue" title="Request received">
            Thanks, {session.firstName}. An administrator will review it. This page opens the app by itself as soon as
            you are approved.
          </Alert>
          <Group justify="space-between">
            <SignOut onSignOut={onSignOut} logoutUrl={logoutUrl} />
            <Button variant="light" size="xs" onClick={() => setEditing(true)}>
              Edit my details
            </Button>
          </Group>
        </Stack>
      )}
    </Card>
  );
}

// Shown when the account was turned down or switched off.
export function AccessBlockedScreen({ session, onSignOut, logoutUrl }: ScreenProps) {
  const rejected = session.status === 'REJECTED';

  return (
    <Card>
      <Group justify="space-between">
        <Title order={3}>{rejected ? 'Access request not approved' : 'Account disabled'}</Title>
        <Badge color={rejected ? 'red' : 'gray'} variant="light">
          {rejected ? 'Rejected' : 'Disabled'}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed">
        Signed in as {session.email}
      </Text>
      <Alert color={rejected ? 'red' : 'gray'}>
        {rejected
          ? (session.rejectionReason ?? 'An administrator did not approve this request.')
          : 'Your account has been disabled. Contact an administrator if you think this is a mistake.'}
      </Alert>
      <SignOut onSignOut={onSignOut} logoutUrl={logoutUrl} />
    </Card>
  );
}

// Local preview only: once approved, say so instead of loading the app as the
// wrong person (the preview user is not the role-switcher admin).
export function PreviewApprovedScreen({ session, onSignOut }: ScreenProps) {
  return (
    <Card>
      <Group justify="space-between">
        <Title order={3}>You are approved</Title>
        <Badge color="green" variant="light">
          Active
        </Badge>
      </Group>
      <Alert color="green">
        {session.email} would now sign in with the <b>{session.roleName ?? 'no'}</b> role.
      </Alert>
      <Button onClick={onSignOut}>Exit sign-up preview</Button>
    </Card>
  );
}
