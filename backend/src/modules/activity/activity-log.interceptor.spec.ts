import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ActivityLogInterceptor } from './activity-log.interceptor';
import { ActivityService } from './activity.service';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function contextFor(req: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('ActivityLogInterceptor', () => {
  let activity: { record: jest.Mock };
  let interceptor: ActivityLogInterceptor;
  const handler = (body: unknown): CallHandler => ({ handle: () => of(body) });

  beforeEach(() => {
    activity = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new ActivityLogInterceptor(activity as unknown as ActivityService);
  });

  it('does not log reads', async () => {
    const result = await lastValueFrom(interceptor.intercept(contextFor({ method: 'GET', path: '/purchases' }), handler([])));
    await flush();

    expect(result).toEqual([]);
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('logs a known change with who did it, a summary and what it touched', async () => {
    const req = {
      method: 'POST',
      path: '/purchases',
      route: { path: '/purchases' },
      params: {},
      body: {},
      user: { id: 'user-1' },
    };

    const result = await lastValueFrom(
      interceptor.intercept(contextFor(req), handler({ id: 'p1', poNumber: 'PO-1', quantity: 5, total: '25.00' })),
    );
    await flush();

    expect(result).toMatchObject({ id: 'p1' });
    expect(activity.record).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'PURCHASE',
      entityType: 'Purchase',
      entityId: 'p1',
      metadata: { summary: 'PO PO-1, quantity 5, total 25.00', method: 'POST', path: '/purchases' },
    });
  });

  it('takes the entity id from the URL when the response has none', async () => {
    const req = { method: 'DELETE', path: '/purchases/p9', route: { path: '/purchases/:id' }, params: { id: 'p9' }, user: { id: 'u' } };

    await lastValueFrom(interceptor.intercept(contextFor(req), handler({})));
    await flush();

    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PURCHASE_DELETE', entityId: 'p9', metadata: expect.objectContaining({ summary: null }) }),
    );
  });

  it('works out the action from the response when the label says so', async () => {
    const req = { method: 'POST', path: '/appointments/a1/review', route: { path: '/appointments/:id/review' }, params: { id: 'a1' }, body: {}, user: { id: 'u' } };

    await lastValueFrom(interceptor.intercept(contextFor(req), handler({ id: 'a1', status: 'DECLINED', subject: 'Gloves' })));
    await flush();

    expect(activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPOINTMENT_DECLINED', entityType: 'Appointment' }));
  });

  it('still logs a change nobody wrote a label for, under its route', async () => {
    const req = { method: 'PATCH', path: '/shifts/s1', route: { path: '/shifts/:id' }, params: { id: 's1' }, body: {}, user: { id: 'u' } };

    await lastValueFrom(interceptor.intercept(contextFor(req), handler({ id: 's1' })));
    await flush();

    expect(activity.record).toHaveBeenCalledWith({
      userId: 'u',
      action: 'PATCH /shifts/:id',
      entityType: 'shifts',
      entityId: 's1',
      metadata: { summary: null, method: 'PATCH', path: '/shifts/s1' },
    });
  });

  it('copes with a missing route, user, body and response', async () => {
    const req = { method: 'POST', path: '/' };

    await lastValueFrom(interceptor.intercept(contextFor(req), handler(null)));
    await flush();

    expect(activity.record).toHaveBeenCalledWith({
      userId: undefined,
      action: 'POST /',
      entityType: 'unknown',
      entityId: '',
      metadata: { summary: null, method: 'POST', path: '/' },
    });
  });

  it('keeps the entry when the response is not shaped the way the summary expects', async () => {
    const req = { method: 'POST', path: '/users/u1/approve', route: { path: '/users/:id/approve' }, params: { id: 'u1' }, user: { id: 'a' } };

    // settings summary reads res.allowedEmailDomains.join, which is undefined here
    const settings = { method: 'PUT', path: '/settings/access', route: { path: '/settings/access' }, params: {}, user: { id: 'a' } };
    await lastValueFrom(interceptor.intercept(contextFor(settings), handler({})));
    await lastValueFrom(interceptor.intercept(contextFor(req), handler({ id: 'u1', email: 'x@y.test', role: { name: 'staff' } })));
    await flush();

    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SETTINGS_UPDATE', metadata: expect.objectContaining({ summary: null }) }),
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_APPROVED', metadata: expect.objectContaining({ summary: 'x@y.test as staff' }) }),
    );
  });
});
