import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';

import { IDEMPOTENT_KEY } from '../../decorators/idempotent.decorator';
import type { IdempotencyService } from '../../services/idempotency.service';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

const build = (beginResult: unknown = null) => {
  const begin = jest.fn().mockResolvedValue(beginResult);
  const complete = jest.fn().mockResolvedValue(undefined);
  const abandon = jest.fn().mockResolvedValue(undefined);
  const idempotency = { begin, complete, abandon } as unknown as IdempotencyService;
  const interceptor = new IdempotencyInterceptor(new Reflector(), idempotency);

  return { interceptor, begin, complete, abandon };
};

const handlerFor = (decorate: boolean, httpCode?: number): (() => void) => {
  const handler = function handler(): void {
    /* stand-in for a route handler */
  };
  if (decorate) {
    Reflect.defineMetadata(IDEMPOTENT_KEY, true, handler);
  }
  if (httpCode !== undefined) {
    Reflect.defineMetadata('__httpCode__', httpCode, handler);
  }
  return handler;
};

class FakeController {}

const contextFor = (
  decorate: boolean,
  request: Record<string, unknown>,
  options: { type?: 'http' | 'rpc'; httpCode?: number } = {},
): ExecutionContext =>
  ({
    getType: () => options.type ?? 'http',
    getHandler: () => handlerFor(decorate, options.httpCode),
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ status: jest.fn() }) }),
  }) as unknown as ExecutionContext;

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

const requestFor = (headers: Record<string, string | undefined> = {}): Record<string, unknown> => ({
  method: 'POST',
  path: '/api/v1/bookings',
  body: { serviceId: 's1' },
  user: { id: 'u1' },
  header: (name: string) => headers[name.toLowerCase()],
});

describe('IdempotencyInterceptor', () => {
  it('passes non-HTTP contexts through untouched', async () => {
    const { interceptor, begin } = build();
    const context = contextFor(true, requestFor(), { type: 'rpc' });

    await interceptor.intercept(context, handlerReturning({ id: 'b1' }));

    expect(begin).not.toHaveBeenCalled();
  });

  it('is a no-op for a route without @Idempotent()', async () => {
    const { interceptor, begin } = build();
    const context = contextFor(false, requestFor({ 'idempotency-key': 'k1' }));

    const result$ = await interceptor.intercept(context, handlerReturning({ id: 'b1' }));

    expect(await firstValueFrom(result$)).toEqual({ id: 'b1' });
    expect(begin).not.toHaveBeenCalled();
  });

  it('is a no-op when the header is absent, even on a decorated route', async () => {
    const { interceptor, begin } = build();
    const context = contextFor(true, requestFor());

    await interceptor.intercept(context, handlerReturning({ id: 'b1' }));

    expect(begin).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no authenticated caller', async () => {
    const { interceptor, begin } = build();
    const request = { ...requestFor({ 'idempotency-key': 'k1' }), user: undefined };
    const context = contextFor(true, request);

    await interceptor.intercept(context, handlerReturning({ id: 'b1' }));

    expect(begin).not.toHaveBeenCalled();
  });

  it('runs the handler and stores the response when the key is new', async () => {
    const { interceptor, begin, complete } = build(null);
    const context = contextFor(true, requestFor({ 'idempotency-key': 'k1' }), { httpCode: 201 });

    const result$ = await interceptor.intercept(context, handlerReturning({ id: 'b1' }));

    expect(await firstValueFrom(result$)).toEqual({ id: 'b1' });
    expect(begin).toHaveBeenCalledWith({
      userId: 'u1',
      key: 'k1',
      method: 'POST',
      path: '/api/v1/bookings',
      requestHash: expect.any(String) as string,
    });
    expect(complete).toHaveBeenCalledWith('u1', 'k1', 201, { id: 'b1' });
  });

  it('replays the stored response without running the handler again', async () => {
    const { interceptor } = build({ status: 201, body: { id: 'b1' } });
    const context = contextFor(true, requestFor({ 'idempotency-key': 'k1' }));
    const handle = jest.fn().mockReturnValue(of({ id: 'should-not-run' }));

    const result$ = await interceptor.intercept(context, { handle });

    expect(await firstValueFrom(result$)).toEqual({ id: 'b1' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('abandons the placeholder when the handler throws', async () => {
    const { interceptor, abandon } = build(null);
    const context = contextFor(true, requestFor({ 'idempotency-key': 'k1' }));
    const failingHandler: CallHandler = {
      handle: () => {
        throw new Error('handler failed');
      },
    };

    await expect(interceptor.intercept(context, failingHandler)).rejects.toThrow('handler failed');
    expect(abandon).toHaveBeenCalledWith('u1', 'k1');
  });
});
