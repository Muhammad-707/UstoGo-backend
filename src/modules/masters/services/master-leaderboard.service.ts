import { Injectable } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';

import type { Locale } from '@common/utils/locale.util';
import { PrismaService } from '@prisma-lib/prisma.service';

import {
  computeIsFastResponder,
  MASTER_PUBLIC_SELECT,
  type MasterRow,
  toMasterPublicDto,
} from './master-public.mapper';
import type { LeaderboardQueryDto } from '../dto/requests/leaderboard-query.dto';
import {
  MasterLeaderboardEntryDto,
  type LeaderboardBadge,
} from '../dto/responses/master-leaderboard-entry.response.dto';

/** A public leaderboard needs enough reviews behind a rating to mean anything. */
const MIN_RATING_COUNT = 3;
const LEADERBOARD_LIMIT = 20;
const TOP_BOOKED_BADGE_COUNT = 3;
const TOP_RATED_MIN_RATING = 4.5;
const TOP_RATED_MIN_COUNT = 10;
const RISING_STAR_DAYS = 90;
const RISING_STAR_MIN_BOOKINGS = 3;
const RISING_STAR_MIN_RATING = 4.0;
const MS_PER_DAY = 86_400_000;

/**
 * Public "best masters" ranking (discovery/gamification). Badges are computed from
 * the same denormalised aggregates the public projection already carries — no extra
 * queries — plus rank within *this* result set for the "most booked" badge, which is
 * why it is not meaningful outside a returned page.
 */
@Injectable()
export class MasterLeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: LeaderboardQueryDto,
    locale: Locale = 'en',
  ): Promise<MasterLeaderboardEntryDto[]> {
    const rows = await this.prisma.db.masterProfile.findMany({
      where: {
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        ratingCount: { gte: MIN_RATING_COUNT },
        ...(query.cityId !== undefined ? { cityId: query.cityId } : {}),
        ...(query.categoryId !== undefined
          ? { categories: { some: { categoryId: query.categoryId } } }
          : {}),
      },
      select: MASTER_PUBLIC_SELECT,
      orderBy: [{ ratingAverage: 'desc' }, { completedBookingsCount: 'desc' }],
      take: LEADERBOARD_LIMIT,
    });

    return rows.map((row, index) => ({
      rank: index + 1,
      badges: this.badgesFor(row, index),
      master: toMasterPublicDto(row, true, locale),
    }));
  }

  private badgesFor(row: MasterRow, index: number): LeaderboardBadge[] {
    const badges: LeaderboardBadge[] = [];
    const ratingAverage = Number(row.ratingAverage);

    if (ratingAverage >= TOP_RATED_MIN_RATING && row.ratingCount >= TOP_RATED_MIN_COUNT) {
      badges.push('TOP_RATED');
    }
    if (index < TOP_BOOKED_BADGE_COUNT) {
      badges.push('MOST_BOOKED');
    }
    if (computeIsFastResponder(row)) {
      badges.push('FAST_RESPONDER');
    }
    if (this.isRisingStar(row, ratingAverage)) {
      badges.push('RISING_STAR');
    }

    return badges;
  }

  private isRisingStar(row: MasterRow, ratingAverage: number): boolean {
    const daysSinceJoined = (Date.now() - row.createdAt.getTime()) / MS_PER_DAY;
    return (
      daysSinceJoined <= RISING_STAR_DAYS &&
      row.completedBookingsCount >= RISING_STAR_MIN_BOOKINGS &&
      ratingAverage >= RISING_STAR_MIN_RATING
    );
  }
}
