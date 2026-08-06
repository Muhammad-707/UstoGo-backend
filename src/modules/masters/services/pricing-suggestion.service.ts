import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { CategoryNotFoundException } from '@modules/categories/exceptions/categories.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { PricingSuggestionResponseDto } from '../dto/responses/pricing-suggestion.response.dto';
import { MasterNotFoundException } from '../exceptions/masters.exceptions';

/** A city sample this small is too noisy to suggest from; fall back to the category. */
const MIN_CITY_SAMPLE = 5;

/**
 * B-41-adjacent (market-rate guidance, not a real-time bidding engine). Draws from
 * the same live `Service.price` rows the public search's `priceFrom` already reads —
 * no new denormalisation, since this is a low-QPS, on-demand read.
 */
@Injectable()
export class PricingSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(userId: string, categoryId: string): Promise<PricingSuggestionResponseDto> {
    const master = await this.prisma.db.masterProfile.findUnique({
      where: { userId },
      select: { id: true, cityId: true },
    });
    if (master === null) {
      throw new MasterNotFoundException();
    }

    const category = await this.prisma.db.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (category === null) {
      throw new CategoryNotFoundException();
    }

    const cityPrices = await this.pricesFor(categoryId, master.id, master.cityId);
    if (cityPrices.length >= MIN_CITY_SAMPLE) {
      return this.buildSuggestion(cityPrices, 'CITY');
    }

    const categoryPrices = await this.pricesFor(categoryId, master.id, null);
    return this.buildSuggestion(categoryPrices, 'CATEGORY_WIDE');
  }

  private async pricesFor(
    categoryId: string,
    excludeMasterId: string,
    cityId: string | null,
  ): Promise<Prisma.Decimal[]> {
    const rows = await this.prisma.db.service.findMany({
      where: {
        categoryId,
        isActive: true,
        masterProfileId: { not: excludeMasterId },
        ...(cityId !== null ? { masterProfile: { cityId } } : {}),
      },
      select: { price: true },
    });

    return rows.map((row) => row.price);
  }

  private buildSuggestion(
    prices: Prisma.Decimal[],
    basis: 'CITY' | 'CATEGORY_WIDE',
  ): PricingSuggestionResponseDto {
    if (prices.length === 0) {
      return {
        basis,
        sampleSize: 0,
        suggestedMin: null,
        suggestedMedian: null,
        suggestedMax: null,
      };
    }

    const sorted = prices.map((price) => Number(price)).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

    return {
      basis,
      sampleSize: sorted.length,
      suggestedMin: (sorted[0] ?? 0).toFixed(2),
      suggestedMedian: median.toFixed(2),
      suggestedMax: (sorted[sorted.length - 1] ?? 0).toFixed(2),
    };
  }
}
