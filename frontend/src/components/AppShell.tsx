import { AppShell as MantineAppShell, Group, ScrollArea } from '@mantine/core';
import type { ReactNode } from 'react';
import { getAuthMode } from '../auth/authMode';
import { NotificationBell } from './NotificationBell';
import { AppNav } from './AppNav';
import { RoleSwitcher } from './RoleSwitcher';
import { SessionBadge } from './SessionBadge';
import { StarsMark } from './StarsMark';

// A navy sidebar down the left, a quiet top bar, and the page in one white
// panel on a cool page. The look itself lives in theme.ts and index.css.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MantineAppShell header={{ height: 56 }} navbar={{ width: 248, breakpoint: 'sm' }} padding="md">
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="flex-end">
          <Group gap="sm">
            <NotificationBell />
            {getAuthMode() === 'cognito' ? <SessionBadge /> : <RoleSwitcher />}
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p={0}>
        <div className="app-logo">
          <img src="/logo.png" alt="Maton Engineering Nig. Ltd." />
        </div>
        {/* A module with sub-items (e.g. HR) expands in place and can push
            later modules below the navbar's fixed height — scroll instead
            of clipping them. */}
        <MantineAppShell.Section grow component={ScrollArea} px="sm" pb="md">
          <AppNav />
        </MantineAppShell.Section>
        <div className="app-sidebar-foot">
          <StarsMark size={16} />
          Mechanical, Civil &amp; Construction Works
        </div>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <div className="page-panel">{children}</div>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
