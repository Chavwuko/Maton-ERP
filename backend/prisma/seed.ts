import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keep this list in sync with `department_seed_roles` in infra/variables.tf —
// each Role name here should match a Cognito group name exactly.
const ROLES = [
  { name: 'admin', description: 'Full system access' },
  { name: 'finance', description: 'Accounting & invoicing module' },
  { name: 'hr', description: 'HR & payroll module' },
  { name: 'maintenance', description: 'Heavy-duty maintenance / CMMS module' },
  { name: 'hse', description: 'HSE reporting & tracking module' },
  { name: 'project_control', description: 'Project control & tracking module' },
  { name: 'document_control', description: 'Document control module' },
  { name: 'inventory', description: 'Inventory & orders module' },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  console.log(`Seeded ${ROLES.length} roles.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
