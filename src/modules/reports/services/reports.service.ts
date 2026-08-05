import { Injectable } from '@nestjs/common';
import { ReportStatus, type Report } from '@prisma/client';

import { UserNotFoundException } from '@modules/users/exceptions/users.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { AdminReportQueryDto } from '../dto/requests/admin-report-query.dto';
import type { CreateReportDto } from '../dto/requests/create-report.dto';
import type { ResolveReportDto } from '../dto/requests/resolve-report.dto';
import {
  CannotReportSelfException,
  ReportAlreadyResolvedException,
  ReportNotFoundException,
} from '../exceptions/reports.exceptions';

const REPORT_WITH_USERS_INCLUDE = {
  reporter: { select: { id: true, email: true } },
  reported: { select: { id: true, email: true } },
  resolvedBy: { select: { id: true, email: true } },
} as const;

type ReportWithUsers = Report & {
  reporter: { id: string; email: string };
  reported: { id: string; email: string };
  resolvedBy: { id: string; email: string } | null;
};

/** §6.8 (MASTER_PROMPT.md). Report-and-block: a client or master flags another user,
 *  an admin reviews and resolves it. The platform-side consequence of a resolved
 *  report is `POST /admin/users/:id/block` (F-02, already shipped) — this module owns
 *  the report record only, not a separate block action. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reporterUserId: string, dto: CreateReportDto): Promise<Report> {
    if (reporterUserId === dto.reportedUserId) {
      throw new CannotReportSelfException();
    }

    const reportedUser = await this.prisma.db.user.findUnique({
      where: { id: dto.reportedUserId },
    });
    if (reportedUser === null) {
      throw new UserNotFoundException();
    }

    return this.prisma.db.report.create({
      data: {
        reporterUserId,
        reportedUserId: dto.reportedUserId,
        type: dto.type,
        description: dto.description,
      },
    });
  }

  async listForAdmin(
    query: AdminReportQueryDto,
  ): Promise<{ items: ReportWithUsers[]; total: number }> {
    const where = query.status === undefined ? {} : { status: query.status };

    const [items, total] = await Promise.all([
      this.prisma.db.report.findMany({
        where,
        include: REPORT_WITH_USERS_INCLUDE,
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.report.count({ where }),
    ]);

    return { items, total };
  }

  async resolve(
    reportId: string,
    adminUserId: string,
    dto: ResolveReportDto,
  ): Promise<ReportWithUsers> {
    const report = await this.prisma.db.report.findUnique({ where: { id: reportId } });
    if (report === null) {
      throw new ReportNotFoundException();
    }
    if (report.status === ReportStatus.RESOLVED || report.status === ReportStatus.REJECTED) {
      throw new ReportAlreadyResolvedException();
    }

    return this.prisma.db.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        adminNote: dto.adminNote ?? null,
        resolvedByUserId: adminUserId,
        resolvedAt: new Date(),
      },
      include: REPORT_WITH_USERS_INCLUDE,
    });
  }
}
