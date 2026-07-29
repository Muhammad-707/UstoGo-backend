import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import type { ErrorDetail } from '@common/exceptions/app.exception';
import { ValidationFailedException } from '@common/exceptions/generic.exceptions';

/**
 * Flattens class-validator's tree into the flat `details` array the envelope specifies
 * (VALIDATION.md §7): nested objects become dot paths, array elements carry indices —
 * `address.line`, `services.0.price`.
 */
const flatten = (errors: readonly ValidationError[], parentPath = ''): ErrorDetail[] =>
  errors.flatMap((error) => {
    const path = parentPath === '' ? error.property : `${parentPath}.${error.property}`;
    const constraints = Object.values(error.constraints ?? {});

    return [
      ...(constraints.length > 0 ? [{ field: path, constraints }] : []),
      ...flatten(error.children ?? [], path),
    ];
  });

/**
 * The global pipe from VALIDATION.md §1. Every setting is load-bearing:
 *
 * - `whitelist` makes mass assignment structurally impossible — an undecorated property
 *   cannot reach a service, which is what defeats `{"role":"ADMIN"}` on registration.
 * - `forbidNonWhitelisted` turns silent stripping into a loud 422, so a client bug
 *   surfaces during integration rather than as missing data in production.
 * - `enableImplicitConversion: false` — implicit coercion turns `"abc"` into `NaN` and
 *   `"0"` into `false`. Conversions are explicit via `@Type()`.
 * - `validationError.value: false` keeps a rejected password out of the error body,
 *   and therefore out of any log that records it.
 */
export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    validationError: { target: false, value: false },
    exceptionFactory: (errors: ValidationError[]) => new ValidationFailedException(flatten(errors)),
  });
