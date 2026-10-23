import { useSyncExternalStore, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { getSession } from '../api/auth';
import { AccessBlockedScreen, PendingApprovalScreen, PreviewApprovedScreen } from './AccessScreens';
import { getAuthMode } from './authMode';
import { getSignupPreviewEmail, setSignupPreviewEmail, subscribeSignupPreview } from './signupPreviewStore';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// How often a waiting user's screen re-checks whether they were approved.
const PENDING_POLL_MS = 10_000;

// AUTH_MODE=local (the default) never gates anything — see backend/src/
// auth/local-dev-auth.guard.ts, which authenticates every request as
// whichever role the RoleSwitcher currently has selected. The one exception
// is the local sign-up preview (RoleSwitcher's "Try sign-up"), which runs
// the same session flow as Cognito mode for a made-up new user.
export function AuthGate({ children }: { children: ReactNode }) {
  const authMode = getAuthMode();
  const previewEmail = useSyncExternalStore(subscribeSignupPreview, getSignupPreviewEmail);
  const usesSession = authMode === 'cognito' || (authMode === 'local' && !!previewEmail);
  const exitPreview = authMode === 'local' ? () => setSignupPreviewEmail(null) : undefined;

  // useQuery must run unconditionally, but only fetches when a session is
  // needed: GET /auth/me would otherwise upsert a fake local-dev user for
  // no reason.
  const { data: session, isLoading } = useQuery({
    queryKey: previewEmail && authMode === 'local' ? ['session', previewEmail] : ['session'],
    queryFn: getSession,
    retry: false,
    enabled: usesSession,
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? PENDING_POLL_MS : false),
  });

  if (!usesSession) {
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
          {exitPreview ? (
            <Button onClick={exitPreview}>Exit sign-up preview</Button>
          ) : (
            <Button component="a" href={`${API_BASE_URL}/auth/login`}>
              Log in
            </Button>
          )}
        </Stack>
      </Center>
    );
  }

  const screenProps = { session, onSignOut: exitPreview, logoutUrl: `${API_BASE_URL}/auth/logout` };

  if (session.status === 'PENDING') {
    return <PendingApprovalScreen {...screenProps} />;
  }
  if (session.status === 'REJECTED' || session.status === 'DISABLED') {
    return <AccessBlockedScreen {...screenProps} />;
  }
  if (exitPreview) {
    return <PreviewApprovedScreen {...screenProps} />;
  }

  return <>{children}</>;
}
