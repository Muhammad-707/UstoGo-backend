import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  MasterSort,
  type MasterSearchQueryDto,
} from '@modules/masters/dto/requests/master-search-query.dto';
import type { MasterPublicResponseDto } from '@modules/masters/dto/responses/master-public.response.dto';
import {
  MASTER_PUBLIC_INCLUDE,
  toMasterPublicDto,
  type MasterRow,
} from '@modules/masters/services/masters-search.service';
import { PrismaService } from '@prisma-lib/prisma.service';

/**
 * F-08 (MODULES.md › SearchModule). Owns nothing — a read-only ranking query over
 * `MastersModule`'s aggregate. The candidate id list and its ordering come from one raw
 * query (full-text over `search_vector`, a real price aggregate, and the `availableOn`
 * check `MasterSearchQueryDto` deferred until this module existed); the public
 * projection is then hydrated through Prisma so field policy stays in one place
 * (`toMasterPublicDto`).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: MasterSearchQueryDto,
  ): Promise<{ items: MasterPublicResponseDto[]; total: number }> {
    const conditions = await this.conditionsFor(query);
    const orderBy = this.orderByFor(query.sort);
    const needsPriceJoin =
      query.sort === MasterSort.PRICE_ASC || query.sort === MasterSort.PRICE_DESC;
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Data and count are separate queries, run in parallel. The single `COUNT(*)
    // OVER()` version forced a scan of every matching row on every request just to
    // answer "how many pages are there?" (measured 39ms over 50,000 masters); the
    // split lets the data query stop after `LIMIT` rows via the composite search
    // index (0.2ms) and makes the count an index-only scan (6.1ms) over the
    // deletedAt-covering index.
    const [rows, countRows] = await Promise.all([
      this.prisma.db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT mp.id
        FROM master_profiles mp
        ${
          needsPriceJoin
            ? Prisma.sql`LEFT JOIN LATERAL (
          SELECT MIN(s.price) AS min_price FROM services s
          WHERE s.master_profile_id = mp.id AND s.is_active = true
        ) price_agg ON true`
            : Prisma.empty
        }
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${query.limit} OFFSET ${query.skip}
      `),
      this.prisma.db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM master_profiles mp
        ${where}
      `),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const ids = rows.map((row) => row.id);

    if (ids.length === 0) {
      return { items: [], total };
    }

    const projected = await this.prisma.db.masterProfile.findMany({
      where: { id: { in: ids } },
      include: MASTER_PUBLIC_INCLUDE,
    });

    const byId = new Map<string, MasterRow>(projected.map((row) => [row.id, row]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((row): row is MasterRow => row !== undefined)
      .map((row) => toMasterPublicDto(row, true));

    return { items, total };
  }

  private async conditionsFor(query: MasterSearchQueryDto): Promise<Prisma.Sql[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`mp.approval_status = 'APPROVED'`,
      Prisma.sql`mp.is_active = true`,
      Prisma.sql`mp.deleted_at IS NULL`,
      ...this.scalarConditions(query),
    ];

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      conditions.push(this.priceCondition(query));
    }
    if (query.categoryId !== undefined) {
      const categoryIds = await this.descendantCategoryIds(query.categoryId);
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM master_categories mc WHERE mc.master_profile_id = mp.id AND mc.category_id IN (${Prisma.join(categoryIds.map((id) => Prisma.sql`${id}::uuid`))}))`,
      );
    }
    if (query.availableOn !== undefined) {
      conditions.push(this.availableOnCondition(query.availableOn));
    }

    return conditions;
  }

  private scalarConditions(query: MasterSearchQueryDto): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [];

    if (query.cityId !== undefined) {
      conditions.push(Prisma.sql`mp.city_id = ${query.cityId}::uuid`);
    }
    if (query.minRating !== undefined) {
      conditions.push(Prisma.sql`mp.rating_average >= ${query.minRating}`);
    }
    if (query.hasCertificates === true) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM certificates c WHERE c.master_profile_id = mp.id AND c.deleted_at IS NULL)`,
      );
    }
    if (query.search !== undefined) {
      conditions.push(Prisma.sql`mp.search_vector @@ plainto_tsquery('simple', ${query.search})`);
    }

    return conditions;
  }

  private priceCondition(query: MasterSearchQueryDto): Prisma.Sql {
    const priceConditions: Prisma.Sql[] = [
      Prisma.sql`s.master_profile_id = mp.id`,
      Prisma.sql`s.is_active = true`,
    ];
    if (query.minPrice !== undefined) {
      priceConditions.push(Prisma.sql`s.price >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      priceConditions.push(Prisma.sql`s.price <= ${query.maxPrice}`);
    }

    return Prisma.sql`EXISTS (SELECT 1 FROM services s WHERE ${Prisma.join(priceConditions, ' AND ')})`;
  }

  /**
   * No `Booking` model until Phase 4 (F-09), so "available" reduces to "has a working
   * window, per the weekly template or an exception, that has not fully elapsed" —
   * exactly what `AvailabilityCalculator` computes without any busy intervals to subtract.
   */
  private availableOnCondition(date: string): Prisma.Sql {
    return Prisma.sql`(
      EXISTS (
        SELECT 1 FROM schedule_exceptions se
        WHERE se.master_profile_id = mp.id AND se.date = ${date}::date AND se.is_day_off = false
          AND se.end_time > (now() AT TIME ZONE mp.timezone)::time
      )
      OR (
        NOT EXISTS (SELECT 1 FROM schedule_exceptions se2 WHERE se2.master_profile_id = mp.id AND se2.date = ${date}::date)
        AND EXISTS (
          SELECT 1 FROM working_days wd
          WHERE wd.master_profile_id = mp.id
            AND wd.weekday = EXTRACT(DOW FROM ${date}::date)
            AND (
              ${date}::date > (now() AT TIME ZONE mp.timezone)::date
              OR wd.end_time > (now() AT TIME ZONE mp.timezone)::time
            )
        )
      )
    )`;
  }

  /** Categories are at most 3 levels deep (BR-20) — two hops covers every descendant. */
  private async descendantCategoryIds(categoryId: string): Promise<string[]> {
    const level1 = await this.prisma.db.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });
    const level2 =
      level1.length === 0
        ? []
        : await this.prisma.db.category.findMany({
            where: { parentId: { in: level1.map((row) => row.id) } },
            select: { id: true },
          });

    return [categoryId, ...level1.map((row) => row.id), ...level2.map((row) => row.id)];
  }

  private orderByFor(sort: MasterSort | undefined): Prisma.Sql {
    switch (sort) {
      case MasterSort.CREATED_DESC:
        return Prisma.sql`mp.created_at DESC`;
      case MasterSort.PRICE_ASC:
        return Prisma.sql`price_agg.min_price ASC NULLS LAST`;
      case MasterSort.PRICE_DESC:
        return Prisma.sql`price_agg.min_price DESC NULLS LAST`;
      case MasterSort.RATING_DESC:
      default:
        return Prisma.sql`mp.rating_average DESC`;
    }
  }
}
