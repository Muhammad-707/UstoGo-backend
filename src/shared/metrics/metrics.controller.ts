import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';

import { MetricsService } from './metrics.service';

/** NFR-O-4 / DEPLOYMENT.md §8 — protected the same way every other admin route is:
 * `@ApiAuth(ADMIN)`, so a scrape config carries an admin bearer token rather than
 * this becoming the one unauthenticated route with platform-wide numbers on it. */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async get(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
