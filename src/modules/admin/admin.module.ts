import { Module } from '@nestjs/common';

import { DashboardController } from './controllers/dashboard.controller';
import { NpsController } from './controllers/nps.controller';
import { DashboardService } from './services/dashboard.service';
import { NpsService } from './services/nps.service';

/**
 * F-15 (MODULES.md › AdminModule). A composition module sitting at the top of the
 * dependency graph (ARCHITECTURE.md §4) — it owns the dashboard's read queries directly
 * against `PrismaService` rather than importing every feature module, since an aggregate
 * report has no business rule to delegate: it reads, it does not decide.
 */
@Module({
  controllers: [DashboardController, NpsController],
  providers: [DashboardService, NpsService],
})
export class AdminModule {}
