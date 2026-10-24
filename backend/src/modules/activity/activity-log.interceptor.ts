import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { ACTIVITY_LABELS } from './activity-labels';
import { ActivityService } from './activity.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Records every successful change request in the activity log, so who did
// what, and when, is answered in one place without each service having to
// remember to log. Reads are not logged, and neither are failed requests.
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly activity: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((res) => {
        void this.write(req, (res ?? {}) as Record<string, unknown>);
      }),
    );
  }

  private async write(req: Request, res: Record<string, unknown>) {
    const routePath = req.route?.path ?? req.path;
    const key = `${req.method} ${routePath}`;
    const label = ACTIVITY_LABELS[key];
    const ctx = { body: (req.body ?? {}) as Record<string, unknown>, res };

    let summary: string | undefined;
    try {
      summary = label?.summary?.(ctx);
    } catch {
      // A response shaped differently than expected must not cost us the entry.
      summary = undefined;
    }

    await this.activity.record({
      userId: req.user?.id,
      action: label ? (typeof label.action === 'function' ? label.action(ctx) : label.action) : key,
      entityType: label?.entityType ?? (String(routePath).split('/')[1] || 'unknown'),
      entityId: String(res.id ?? req.params?.id ?? ''),
      metadata: { summary: summary ?? null, method: req.method, path: req.path },
    });
  }
}
