import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { AdminCertificatesController } from './controllers/admin-certificates.controller';
import { AdminMastersController } from './controllers/admin-masters.controller';
import { MasterQuickRepliesController } from './controllers/master-quick-replies.controller';
import { MastersMeController } from './controllers/masters-me.controller';
import { MastersController } from './controllers/masters.controller';
import { AdminCertificatesService } from './services/admin-certificates.service';
import { AdminMasterStatsService } from './services/admin-master-stats.service';
import { MasterLeaderboardService } from './services/master-leaderboard.service';
import { MasterModerationService } from './services/master-moderation.service';
import { MastersSearchService } from './services/masters-search.service';
import { MastersService } from './services/masters.service';
import { PricingSuggestionService } from './services/pricing-suggestion.service';
import { QuickRepliesService } from './services/quick-replies.service';
import { RecentlyViewedService } from './services/recently-viewed.service';

/** F-03 / F-04 (MODULES.md › MastersModule). */
@Module({
  imports: [FilesModule],
  /**
   * ORDER MATTERS — Express matches routes first-registered-wins. The
   * `masters/me/*` cabinet routes must be registered before the public
   * `masters/:id/*` wildcards, or `/masters/me/certificates` etc. would be
   * swallowed by `:id/certificates` with `id = "me"` (and die on the UUID cast).
   * `masters/me/services` and `masters/me/schedule` are registered even earlier
   * by `ServicesModule` / `ScheduleModule` (see `PublicServicesController` and
   * `PublicScheduleController`), which `AppModule` imports before this module.
   */
  controllers: [
    MastersMeController,
    MasterQuickRepliesController,
    MastersController,
    AdminMastersController,
    AdminCertificatesController,
  ],
  providers: [
    MastersService,
    MastersSearchService,
    MasterModerationService,
    AdminMasterStatsService,
    AdminCertificatesService,
    QuickRepliesService,
    RecentlyViewedService,
    MasterLeaderboardService,
    PricingSuggestionService,
  ],
  exports: [MastersService, MastersSearchService],
})
export class MastersModule {}
