import { Module } from '@nestjs/common';

import { ServicesController } from './controllers/services.controller';
import { ServicesService } from './services/services.service';

/** F-06 (MODULES.md › ServicesModule). */
@Module({
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
