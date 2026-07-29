import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '@prisma/client';
import { of } from 'rxjs';

import { AUDIT_KEY } from '../../decorators/audit.decorator';
import type { AuditService } from '../../services/audit.service';
import { AuditInterceptor } from '../audit.interceptor';

const build = () => {
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const interceptor = new AuditInterceptor(new Reflector(), audit);

  return { interceptor, record };
};

/** A decorated (or, with no strategy, undecorated) fake controller method. */
const handlerFor = (decorate: boolean): (() => void) => {
  const handler = function handler(): void {
    /* stand-in for a route handler */
  };
  if (decorate) {
    Reflect.defineMetadata(
      AUDIT_KEY,
      { action: AuditAction.CATEGORY_CREATED, entityType: 'Category' },
      handler,
    );
  }

  return handler;
};

class FakeController {}

const contextFor = (
  decorate: boolean,
  request: Record<string, unknown>,
  type: 'http' | 'rpc' = 'http',
): ExecutionContext =>
  ({
    getType: () => type,
    getHandler: () => handlerFor(decorate),
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('AuditInterceptor', () => {
  it('passes non-HTTP contexts through untouched', async () => {
    const { interceptor, record } = build();
    const context = contextFor(true, {}, 'rpc');

    interceptor.intercept(context, handlerReturning({ id: 'x' })).subscribe();
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('is a no-op for a route with no @Audit()', async () => {
    const { interceptor, record } = build();
    const context = contextFor(false, {
      user: { id: 'admin-1' },
      params: {},
      body: {},
      header: () => undefined,
    });

    interceptor.intercept(context, handlerReturning({ id: 'x' })).subscribe();
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('records actor, entity id, ip and user agent for a decorated route', async () => {
    const { interceptor, record } = build();
    const request = {
      user: { id: 'admin-1' },
      params: {},
      body: { name: 'Plumbing' },
      ip: '1.2.3.4',
      header: (name: string) => (name === 'user-agent' ? 'jest' : undefined),
    };
    const context = contextFor(true, request);

    interceptor.intercept(context, handlerReturning({ id: 'cat-1', name: 'Plumbing' })).subscribe();
    await flush();

    expect(record).toHaveBeenCalledWith({
      actorUserId: 'admin-1',
      action: AuditAction.CATEGORY_CREATED,
      entityType: 'Category',
      entityId: 'cat-1',
      before: { name: 'Plumbing' },
      after: { id: 'cat-1', name: 'Plumbing' },
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });
  });

  it('prefers the route param id over the response body id', async () => {
    const { interceptor, record } = build();
    const request = {
      user: { id: 'admin-1' },
      params: { id: 'cat-1' },
      body: { name: 'Plumbing' },
      header: () => undefined,
    };
    const context = contextFor(true, request);

    interceptor.intercept(context, handlerReturning(undefined)).subscribe();
    await flush();

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'cat-1' }));
  });

  it('redacts sensitive fields in the before payload', async () => {
    const { interceptor, record } = build();
    const request = {
      user: { id: 'admin-1' },
      params: { id: 'cat-1' },
      body: { password: 'hunter2' },
      header: () => undefined,
    };
    const context = contextFor(true, request);

    interceptor.intercept(context, handlerReturning(undefined)).subscribe();
    await flush();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ before: { password: '[REDACTED]' } }),
    );
  });

  it('does not record when the route has no authenticated caller', async () => {
    const { interceptor, record } = build();
    const request = { params: { id: 'cat-1' }, body: {}, header: () => undefined };
    const context = contextFor(true, request);

    interceptor.intercept(context, handlerReturning(undefined)).subscribe();
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does not record when no entity id can be resolved', async () => {
    const { interceptor, record } = build();
    const request = {
      user: { id: 'admin-1' },
      params: {},
      body: {},
      header: () => undefined,
    };
    const context = contextFor(true, request);

    interceptor.intercept(context, handlerReturning(undefined)).subscribe();
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does not treat a non-string response id as an entity id', async () => {
    const { interceptor, record } = build();
    const request = {
      user: { id: 'admin-1' },
      params: {},
      body: {},
      header: () => undefined,
    };
    const context = contextFor(true, request);

    interceptor.intercept(context, handlerReturning({ id: 12345 })).subscribe();
    await flush();

    expect(record).not.toHaveBeenCalled();
  });
});
