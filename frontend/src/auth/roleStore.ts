// Mirrors the roles LocalDevAuthGuard/prisma/seed.ts know about — see
// backend/src/auth/local-dev-auth.guard.ts and infra/variables.tf's
// department_seed_roles. Any string works as an x-local-role value (the
// guard upserts it on demand), but these are the ones the app actually
// gates routes on.
export const ROLES = [
  'admin',
  'finance',
  'hr',
  'maintenance',
  'hse',
  'project_control',
  'document_control',
  'inventory',
] as const;

export type Role = (typeof ROLES)[number];

const STORAGE_KEY = 'erp.currentRole';

function isRole(value: string | null): value is Role {
  return !!value && (ROLES as readonly string[]).includes(value);
}

let currentRole: Role = ((): Role => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isRole(stored) ? stored : 'admin';
})();

export function getCurrentRole(): Role {
  return currentRole;
}

export function setCurrentRole(role: Role): void {
  currentRole = role;
  localStorage.setItem(STORAGE_KEY, role);
}
