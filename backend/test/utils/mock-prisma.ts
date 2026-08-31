import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../src/database/prisma.service';

export type MockPrisma = DeepMockProxy<PrismaService>;

// Every service in this codebase calls `$transaction(async (tx) => ...)`
// (the interactive-transaction form) — never the array form — so this
// makes $transaction just invoke the callback with the same mock, letting
// tx.model.method(...) calls inside it resolve via whatever the test
// configured on the outer mock.
export function createMockPrisma(): MockPrisma {
  const prisma = mockDeep<PrismaService>();
  (prisma.$transaction as jest.Mock).mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: MockPrisma) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}
