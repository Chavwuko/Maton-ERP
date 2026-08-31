// Runs once before the whole e2e run (Jest `globalSetup`), plain JS/CommonJS
// so it doesn't need ts-jest's transform. Truncates every app table so each
// e2e run starts from an empty local dev database — safe because this only
// ever targets the local Postgres from docker-compose (DATABASE_URL in
// backend/.env), never a real environment. Roles are recreated on demand by
// LocalDevAuthGuard the first time a test uses a given x-local-role header,
// so they don't need reseeding here.
const { PrismaClient } = require('@prisma/client');

const TABLES = [
  'appraisal_reviewers',
  'appraisals',
  'appraisal_cycles',
  'employees',
  'payments',
  'invoices',
  'vendors',
  'corrective_actions',
  'incidents',
  'stock_transactions',
  'stock_levels',
  'inventory_items',
  'warehouses',
  'work_orders',
  'document_approvals',
  'document_versions',
  'documents',
  'project_milestones',
  'projects',
  'assets',
  'audit_logs',
  'role_permissions',
  'permissions',
  'users',
  'departments',
  'organizations',
  'roles',
];

module.exports = async () => {
  const prisma = new PrismaClient();
  const list = TABLES.map((t) => `"${t}"`).join(',');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  await prisma.$disconnect();
};
