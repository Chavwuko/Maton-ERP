import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, Stack, Switch, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { getAccessSettings, updateAccessSettings } from '../../api/settings';

// Domains are typed one per line or comma separated.
function parseDomains(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((domain) => domain.trim())
    .filter(Boolean);
}

export function AccessSettingsPanel() {
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['access-settings'], queryFn: getAccessSettings });

  const form = useForm({ initialValues: { openSignup: true, domains: '' } });

  useEffect(() => {
    if (settings) {
      form.setValues({ openSignup: settings.openSignup, domains: settings.allowedEmailDomains.join('\n') });
      form.resetDirty();
    }
    // Re-seed only when fresh settings arrive, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      updateAccessSettings({ openSignup: values.openSignup, allowedEmailDomains: parseDomains(values.domains) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-settings'] });
      notifications.show({ message: 'Sign-up settings saved', color: 'green' });
    },
    onError: (err) =>
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to save settings', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load sign-up settings">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <form noValidate onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
      <Stack maw={480}>
        <Switch
          label="Allow new sign-ups"
          description="When off, anyone who signs up is turned away automatically."
          {...form.getInputProps('openSignup', { type: 'checkbox' })}
        />
        <Textarea
          label="Allowed email domains"
          description="One per line, e.g. company.com. Leave empty to allow any email address."
          minRows={3}
          {...form.getInputProps('domains')}
        />
        <Text size="xs" c="dimmed">
          These checks apply to new sign-ups only. People already in the list are not affected.
        </Text>
        <Group>
          <Button type="submit" loading={mutation.isPending}>
            Save settings
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
