import { Module } from '@nestjs/common';

import { QuotesController } from './controllers/quotes.controller';
import { QuotesService } from './services/quotes.service';

/** B-44 (MODULES.md › QuotesModule). A client's pre-booking price inquiry. */
@Module({
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
