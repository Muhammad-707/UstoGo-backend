import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { AdminMastersController } from './controllers/admin-masters.controller';
import { MastersMeController } from './controllers/masters-me.controller';
import { MastersController } from './controllers/masters.controller';
import { MasterModerationService } from './services/master-moderation.service';
import { MastersSearchService } from './services/masters-search.service';
import { MastersService } from './services/masters.service';

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
  controllers: [MastersMeController, MastersController, AdminMastersController],
  providers: [MastersService, MastersSearchService, MasterModerationService],
  exports: [MastersService, MastersSearchService],
})
export class MastersModule {}
