// Mirrors the backend's AUTH_MODE switch (see backend/src/auth/auth.module.ts).
// 'local' (the default) keeps today's x-local-role role-switcher behavior;
// 'cognito' switches to the real backend-mediated login flow (AuthController)
// and a read-only role resolved from the session.
export type AuthMode = 'local' | 'cognito';

export function getAuthMode(): AuthMode {
  return import.meta.env.VITE_AUTH_MODE === 'cognito' ? 'cognito' : 'local';
}
