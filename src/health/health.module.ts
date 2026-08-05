import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { StorageHealthIndicator } from './indicators/storage.health-indicator';

/**
 * `/health` and `/health/ready` (MODULES.md › HealthModule).
 *
 * PrismaModule, ConfigModule and RedisModule are global, so nothing is imported here.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService, DatabaseHealthIndicator, StorageHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
