import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getEmailSettings, updateEmailSettings } from '../../api/settings';

// The master switch for every email the system sends: sign-up decisions,
// bookings, and the daily reminder. Admin only.
export function EmailSettingsPanel() {
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['email-settings'], queryFn: getEmailSettings });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateEmailSettings({ enabled }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['email-settings'] });
      notifications.show({ message: saved.enabled ? 'Email notifications are on' : 'Email notifications are off', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to save the email setting', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load the email setting">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <Stack maw={480} gap="sm">
      <Title order={4}>Email notifications</Title>
      <Switch
        label="Send email notifications"
        description="Sign-up decisions, new and reviewed bookings, and a daily reminder of anything waiting more than 24 hours."
        checked={settings?.enabled ?? true}
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate(event.currentTarget.checked)}
      />
      {settings?.transport === 'log' && (
        <Alert color="yellow" title="No mail server is connected">
          Emails are only written to the server log, so nobody receives them yet. Set <Text span ff="monospace">MAIL_TRANSPORT=smtp</Text>{' '}
          and the <Text span ff="monospace">SMTP_*</Text> settings on the server to send them for real.
        </Alert>
      )}
    </Stack>
  );
}
