import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Marks a mutating endpoint as safe to dedupe on a client-supplied `Idempotency-Key`
 * header. A no-op for any route without it — `IdempotencyInterceptor` is registered
 * globally, following `AuditInterceptor`'s own precedent, so adding it cannot start
 * enforcing idempotency on a route nobody opted into.
 */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT_KEY, true);
