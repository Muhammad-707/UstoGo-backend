import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import type { AppRequest } from '@common/types/app-request.type';

import { AUDIT_KEY, type AuditMetadata } from '../decorators/audit.decorator';
import { redactSensitiveFields } from '../domain/redact.util';
import { AuditService } from '../services/audit.service';

/**
 * Writes the audit row so the mutation's own service never has to (FEATURES.md ›
 * F-16). A no-op for any route without `@Audit()` — most of the application — so
 * adding this globally cannot start recording a route nobody decorated.
 *
 * `before` is the submitted payload and `after` the returned representation, not a
 * database read of prior state: a generic interceptor has no way to know which
 * repository owns the entity, and reading it twice on every privileged mutation to
 * recover state the service already loaded once would be paying for the same row
 * again. What the caller asked for and what they got back is the diff this can offer
 * honestly without that coupling.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (metadata === undefined) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AppRequest>();

    return next.handle().pipe(
      tap((response: unknown) => {
        void this.write(metadata, request, response);
      }),
    );
  }

  private async write(
    metadata: AuditMetadata,
    request: AppRequest,
    response: unknown,
  ): Promise<void> {
    const actorUserId = request.user?.id;

    if (actorUserId === undefined) {
      this.logger.warn(
        `@Audit(${metadata.action}) on a route with no authenticated caller — nothing recorded.`,
      );
      return;
    }

    const entityId = this.entityIdOf(request, response);

    if (entityId === undefined) {
      this.logger.warn(
        `@Audit(${metadata.action}) could not resolve an entity id for ${metadata.entityType} — nothing recorded.`,
      );
      return;
    }

    const userAgent = request.header('user-agent');

    await this.audit.record({
      actorUserId,
      action: metadata.action,
      entityType: metadata.entityType,
      entityId,
      before: redactSensitiveFields(request.body),
      after: redactSensitiveFields(response),
      ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
    });
  }

  /** The route param wins — a PATCH/DELETE names its target — falling back to a
   *  created entity's own id in the response body. */
  private entityIdOf(request: AppRequest, response: unknown): string | undefined {
    const paramId = request.params.id;

    if (typeof paramId === 'string' && paramId.length > 0) {
      return paramId;
    }

    if (response !== null && typeof response === 'object' && 'id' in response) {
      return typeof response.id === 'string' ? response.id : undefined;
    }

    return undefined;
  }
}
