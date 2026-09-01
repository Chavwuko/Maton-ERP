import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { getSession } from '../api/auth';
import { getAuthMode } from './authMode';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// AUTH_MODE=local (the default) never gates anything — see backend/src/
// auth/local-dev-auth.guard.ts, which authenticates every request as
// whichever role the RoleSwitcher currently has selected.
export function AuthGate({ children }: { children: ReactNode }) {
  const authMode = getAuthMode();
  // useQuery must run unconditionally, but only fetches in cognito mode:
  // GET /auth/me would otherwise upsert a fake local-dev user for no reason.
  const { data: session, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    retry: false,
    enabled: authMode === 'cognito',
  });

  if (authMode === 'local') {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!session) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="xs">
          <Title order={2}>ERP Foundations</Title>
          <Text c="dimmed">Sign in with your organization account to continue.</Text>
          <Button component="a" href={`${API_BASE_URL}/auth/login`}>
            Log in
          </Button>
        </Stack>
      </Center>
    );
  }

  return <>{children}</>;
}
