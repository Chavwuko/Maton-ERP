import { useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useRole } from '../auth/RoleContext';
import { ROLES, type Role } from '../auth/roleStore';
import { setSignupPreviewEmail } from '../auth/signupPreviewStore';

export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [email, setEmail] = useState('');
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Group gap="xs">
      <Text size="sm" c="dimmed">
        Acting as
      </Text>
      <Select
        value={role}
        onChange={(value) => value && setRole(value as Role)}
        data={ROLES.map((r) => ({ value: r, label: r }))}
        allowDeselect={false}
        w={180}
      />
      <Button variant="subtle" size="xs" onClick={() => setPreviewOpen(true)}>
        Try sign-up
      </Button>

      <Modal opened={previewOpen} onClose={() => setPreviewOpen(false)} title="Try the sign-up flow">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (emailValid) setSignupPreviewEmail(email.trim());
          }}
        >
          <Stack>
            <Text size="sm">
              Pretend to be someone who just signed up. They see the request-access screen until an admin approves
              them here under Users. Local development only.
            </Text>
            <TextInput
              label="New user's email"
              placeholder="new.hire@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button type="submit" disabled={!emailValid}>
                Start preview
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Group>
  );
}
