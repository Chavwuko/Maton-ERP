import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { firstValueFrom, of } from 'rxjs';
import { StaffCostRedactionInterceptor } from './staff-cost-redaction.interceptor';

function contextFor(roleName: string | undefined): ExecutionContext {
  const req = roleName === undefined ? {} : { user: { roleName } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const handlerReturning = (body: unknown): CallHandler => ({ handle: () => of(body) });

describe('StaffCostRedactionInterceptor', () => {
  const interceptor = new StaffCostRedactionInterceptor();
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const body = {
    id: 'item-1',
    unitCost: new Prisma.Decimal('4.80'),
    stockValue: '38.40',
    purchaseCost: '900.00',
    totalOnHand: 8,
    createdAt,
    category: null,
    rows: [{ id: 'p1', total: '10.00', quantity: 2, unitCost: '5.00' }],
  };

  it('strips every cost field, at any depth, for the staff role', async () => {
    const result = await firstValueFrom(interceptor.intercept(contextFor('staff'), handlerReturning(body)));

    expect(result).toEqual({
      id: 'item-1',
      totalOnHand: 8,
      createdAt,
      category: null,
      rows: [{ id: 'p1', quantity: 2 }],
    });
  });

  it('handles lists and plain values', async () => {
    const list = await firstValueFrom(
      interceptor.intercept(contextFor('staff'), handlerReturning([{ unitCost: '1', name: 'a' }])),
    );
    const scalar = await firstValueFrom(interceptor.intercept(contextFor('staff'), handlerReturning(null)));

    expect(list).toEqual([{ name: 'a' }]);
    expect(scalar).toBeNull();
  });

  it('leaves everything intact for other roles', async () => {
    for (const role of ['admin', 'inventory', 'viewer']) {
      const result = await firstValueFrom(interceptor.intercept(contextFor(role), handlerReturning(body)));
      expect(result).toBe(body);
    }
  });

  it('leaves the response alone when there is no signed-in user', async () => {
    const result = await firstValueFrom(interceptor.intercept(contextFor(undefined), handlerReturning(body)));

    expect(result).toBe(body);
  });
});
