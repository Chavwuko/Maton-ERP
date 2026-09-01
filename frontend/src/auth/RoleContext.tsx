import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession } from '../api/auth';
import { getAuthMode } from './authMode';
import { getCurrentRole, setCurrentRole, type Role } from './roleStore';

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

function LocalRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(getCurrentRole());
  const queryClient = useQueryClient();

  const setRole = (next: Role) => {
    setCurrentRole(next);
    setRoleState(next);
    // Every request carries the acting role (RBAC, and LocalDevAuthGuard
    // even resolves a distinct fake user per role) — switching roles makes
    // every cached query stale.
    queryClient.invalidateQueries();
  };

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

// AUTH_MODE=cognito: role is resolved server-side from Cognito group
// membership (see CognitoAuthGuard) and surfaced read-only via GET
// /auth/me — there's no switcher, so setRole is a no-op. A session with no
// group assigned yet (or one AuthGate hasn't confirmed) resolves to a role
// name that matches nothing in ROLES, which is the correct "no permissions"
// behavior for every existing hasRole(...) check.
function CognitoRoleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useQuery({ queryKey: ['session'], queryFn: getSession, retry: false });
  const role = (session?.roleName ?? 'none') as Role;

  return <RoleContext.Provider value={{ role, setRole: () => {} }}>{children}</RoleContext.Provider>;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  return getAuthMode() === 'cognito' ? (
    <CognitoRoleProvider>{children}</CognitoRoleProvider>
  ) : (
    <LocalRoleProvider>{children}</LocalRoleProvider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return ctx;
}
