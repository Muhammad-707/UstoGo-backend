import { Module } from '@nestjs/common';

import { AdminReportsController } from './controllers/admin-reports.controller';
import { ReportsController } from './controllers/reports.controller';
import { ReportsService } from './services/reports.service';

/** §6.8 (MASTER_PROMPT.md) — report-and-block between users. */
@Module({
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
