import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { computeNps } from '../../reviews/domain/nps.util';
import { isValidDashboardRange, resolveDashboardRange } from '../domain/dashboard-range.util';
import type { DashboardQueryDto } from '../dto/requests/dashboard-query.dto';
import type {
  NpsByCategoryDto,
  NpsByMasterDto,
  NpsResponseDto,
} from '../dto/responses/nps.response.dto';
import { DashboardRangeInvalidException } from '../exceptions/admin.exceptions';

const TOP_MASTERS_LIMIT = 10;

type NpsReviewRow = {
  npsScore: number;
  masterProfileId: string;
  booking: { serviceId: string };
};

/**
 * `GET /admin/nps` (MASTER_PROMPT.md §6.1/§5). Reuses `DashboardQueryDto`'s
 * independently-optional `from`/`to` and range validation — the same reporting
 * shape F-15's dashboard already established, applied to a different aggregate.
 */
@Injectable()
export class NpsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNps(query: DashboardQueryDto): Promise<NpsResponseDto> {
    const { from, to } = resolveDashboardRange(query.from, query.to);
    if (!isValidDashboardRange(from, to)) {
      throw new DashboardRangeInvalidException();
    }

    const reviews = await this.prisma.db.review.findMany({
      where: {
        status: ReviewStatus.VISIBLE,
        npsScore: { not: null },
        createdAt: { gte: from, lte: to },
      },
      select: { npsScore: true, masterProfileId: true, booking: { select: { serviceId: true } } },
    });
    const rows = reviews as NpsReviewRow[];

    const overall = computeNps(rows.map((row) => row.npsScore));
    const [byCategory, byMaster] = await Promise.all([this.byCategory(rows), this.byMaster(rows)]);

    return {
      overallNps: overall.nps,
      promoters: overall.promoters,
      passives: overall.passives,
      detractors: overall.detractors,
      responseCount: overall.responseCount,
      byCategory,
      byMaster,
    };
  }

  private async byCategory(rows: NpsReviewRow[]): Promise<NpsByCategoryDto[]> {
    if (rows.length === 0) {
      return [];
    }

    const services = await this.prisma.db.service.findMany({
      where: { id: { in: Array.from(new Set(rows.map((row) => row.booking.serviceId))) } },
      select: { id: true, category: { select: { id: true, name: true } } },
    });
    const categoryByServiceId = new Map(services.map((service) => [service.id, service.category]));

    const scoresByCategory = new Map<string, { name: string; scores: number[] }>();
    for (const row of rows) {
      const category = categoryByServiceId.get(row.booking.serviceId);
      if (category === undefined) {
        continue;
      }
      const entry = scoresByCategory.get(category.id) ?? { name: category.name, scores: [] };
      entry.scores.push(row.npsScore);
      scoresByCategory.set(category.id, entry);
    }

    return Array.from(scoresByCategory.entries())
      .map(([categoryId, entry]) => {
        const { nps, responseCount } = computeNps(entry.scores);
        return { categoryId, categoryName: entry.name, nps, responseCount };
      })
      .sort((a, b) => b.responseCount - a.responseCount);
  }

  private async byMaster(rows: NpsReviewRow[]): Promise<NpsByMasterDto[]> {
    if (rows.length === 0) {
      return [];
    }

    const scoresByMaster = new Map<string, number[]>();
    for (const row of rows) {
      const scores = scoresByMaster.get(row.masterProfileId) ?? [];
      scores.push(row.npsScore);
      scoresByMaster.set(row.masterProfileId, scores);
    }

    const topMasterIds = Array.from(scoresByMaster.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, TOP_MASTERS_LIMIT)
      .map(([masterProfileId]) => masterProfileId);

    const masters = await this.prisma.db.masterProfile.findMany({
      where: { id: { in: topMasterIds } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(masters.map((master) => [master.id, master.displayName]));

    return topMasterIds
      .map((masterId) => {
        const { nps, responseCount } = computeNps(scoresByMaster.get(masterId) ?? []);
        return { masterId, displayName: nameById.get(masterId) ?? '', nps, responseCount };
      })
      .sort((a, b) => b.responseCount - a.responseCount);
  }
}
