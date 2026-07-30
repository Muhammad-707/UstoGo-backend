import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import type { AppRequest } from '@common/types/app-request.type';

import { IDEMPOTENT_KEY } from '../decorators/idempotent.decorator';
import { hashRequest } from '../domain/request-hash.util';
import { IdempotencyService } from '../services/idempotency.service';

const HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 200;

/**
 * A no-op for any route without `@Idempotent()`, and a no-op for a decorated route
 * called without the header — the header is optional, per `ERROR_HANDLING.md` §7.
 * Only when both are present does this dedupe on `(userId, key)`.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const isIdempotent = this.reflector.getAllAndOverride<boolean | undefined>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isIdempotent !== true) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const rawKey = request.header(HEADER);
    const userId = request.user?.id;

    if (rawKey === undefined || userId === undefined) {
      return next.handle();
    }

    const key = rawKey.slice(0, MAX_KEY_LENGTH);
    const requestHash = hashRequest(request.method, request.path, request.body);

    const stored = await this.idempotency.begin({
      userId,
      key,
      method: request.method,
      path: request.path,
      requestHash,
    });

    if (stored !== null) {
      const response = context.switchToHttp().getResponse<{ status: (code: number) => unknown }>();
      response.status(stored.status);
      return of(stored.body);
    }

    const status =
      this.reflector.getAllAndOverride<number | undefined>(HTTP_CODE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? (request.method === 'POST' ? 201 : 200);

    try {
      const result = await firstValueFrom(
        next.handle().pipe(
          tap((body: unknown) => {
            void this.idempotency.complete(userId, key, status, body ?? null);
          }),
        ),
      );

      return of(result);
    } catch (error) {
      await this.idempotency.abandon(userId, key);
      throw error;
    }
  }
}
