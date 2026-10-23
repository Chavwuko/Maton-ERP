// Roles an admin can hand out when approving or editing a user. Keep in sync
// with prisma/seed.ts and `department_seed_roles` in infra/variables.tf.
// `staff` and `viewer` come from the old store system: staff can see and
// request stock but not costs, viewer is read-only.
export const ASSIGNABLE_ROLES = [
  'admin',
  'finance',
  'hr',
  'maintenance',
  'hse',
  'project_control',
  'document_control',
  'inventory',
  'staff',
  'viewer',
] as const;
