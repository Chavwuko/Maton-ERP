import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { map, Observable } from 'rxjs';

// The old store system never showed money to ordinary staff. Cost fields are
// stripped from every inventory response for the `staff` role; every other
// role sees them unchanged.
const COST_FIELDS = new Set(['unitCost', 'stockValue', 'total']);
const HIDDEN_FROM_ROLE = 'staff';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  // Only plain objects are walked; Dates and Prisma Decimals are leaf values.
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !COST_FIELDS.has(key))
        .map(([key, child]) => [key, redact(child)]),
    );
  }
  return value;
}

@Injectable()
export class StaffCostRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.user?.roleName !== HIDDEN_FROM_ROLE) {
      return next.handle();
    }
    return next.handle().pipe(map(redact));
  }
}
