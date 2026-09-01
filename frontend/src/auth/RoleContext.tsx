import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentRole, setCurrentRole, type Role } from './roleStore';

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
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

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return ctx;
}
