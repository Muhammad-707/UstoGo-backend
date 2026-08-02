import { Module } from '@nestjs/common';

import { MastersModule } from '@modules/masters/masters.module';

import { PublicServicesController } from './controllers/public-services.controller';
import { ServicesController } from './controllers/services.controller';
import { ServicesService } from './services/services.service';

/** F-06 (MODULES.md › ServicesModule). */
@Module({
  imports: [MastersModule],
  controllers: [ServicesController, PublicServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
