import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type AuditAction, type AuditLog } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import type { AuditLogQueryDto } from '../dto/requests/audit-log-query.dto';

export type AuditEntry = {
  readonly actorUserId: string;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reason?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
};

export type AuditLogPage = {
  readonly items: readonly AuditLog[];
  readonly total: number;
};

/**
 * Append-only (SECURITY.md §2.9, DATABASE.md §13). No method here updates or deletes a
 * row — that absence is the guarantee, not a gap left for later.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws. `AuditInterceptor` calls this after the mutation it is recording has
   * already committed and responded — a failed write here must not turn a successful
   * request into a failed one, so the failure is logged for the alerting in
   * `DEPLOYMENT.md` §8 rather than propagated.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.db.auditLog.create({
        data: {
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ...(entry.before !== undefined ? { before: entry.before as Prisma.InputJsonValue } : {}),
          ...(entry.after !== undefined ? { after: entry.after as Prisma.InputJsonValue } : {}),
          ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
          ...(entry.ipAddress !== undefined ? { ipAddress: entry.ipAddress } : {}),
          ...(entry.userAgent !== undefined ? { userAgent: entry.userAgent } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} on ${entry.entityType}:${entry.entityId}: ${(error as Error).message}`,
      );
    }
  }

  async list(query: AuditLogQueryDto): Promise<AuditLogPage> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId !== undefined ? { actorUserId: query.actorUserId } : {}),
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.entityType !== undefined ? { entityType: query.entityType } : {}),
      ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            createdAt: {
              ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
              ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
