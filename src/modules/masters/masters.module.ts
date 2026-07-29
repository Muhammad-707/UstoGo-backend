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
  controllers: [MastersController, MastersMeController, AdminMastersController],
  providers: [MastersService, MastersSearchService, MasterModerationService],
  exports: [MastersService, MastersSearchService],
})
export class MastersModule {}
