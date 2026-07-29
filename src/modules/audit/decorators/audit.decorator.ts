import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit';

export type AuditMetadata = {
  readonly action: AuditAction;
  readonly entityType: string;
};

/**
 * Marks a mutation for `AuditInterceptor`. Absence means "not audited" — there is no
 * implicit default, because a route that mutates state but was never meant to be
 * privileged (there are none yet) must not silently start writing rows the moment the
 * interceptor is added.
 */
export const Audit = (action: AuditAction, entityType: string): CustomDecorator<string> =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMetadata);
