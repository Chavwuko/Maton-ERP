import { AppShell as MantineAppShell, Group, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { getAuthMode } from '../auth/authMode';
import { AppNav } from './AppNav';
import { RoleSwitcher } from './RoleSwitcher';
import { SessionBadge } from './SessionBadge';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MantineAppShell header={{ height: 60 }} navbar={{ width: 240, breakpoint: 'sm' }} padding="md">
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>ERP Foundations</Title>
          {getAuthMode() === 'cognito' ? <SessionBadge /> : <RoleSwitcher />}
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="md">
        <AppNav />
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
