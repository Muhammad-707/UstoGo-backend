import { Injectable } from '@nestjs/common';
import type { City } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

/**
 * Reference data, so the cap is generous rather than a page size: the whole list is
 * meant to be fetched once and cached by the client. The `take` is still present
 * because no `findMany` goes unbounded (CODING_STANDARDS.md §6) — if the list ever
 * grew past it, that is a signal the endpoint needs pagination, not a silent truncation
 * anyone would tolerate.
 */
const MAX_CITIES = 500;

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Withdrawn cities stay in the table so historical rows keep resolving. */
  async listActive(): Promise<City[]> {
    return this.prisma.db.city.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: MAX_CITIES,
    });
  }
}
