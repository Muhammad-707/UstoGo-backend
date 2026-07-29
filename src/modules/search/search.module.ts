import { Module } from '@nestjs/common';

import { MastersModule } from '@modules/masters/masters.module';

import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';

/** F-08 (MODULES.md › SearchModule). Owns nothing — read-only projections. */
@Module({
  imports: [MastersModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
