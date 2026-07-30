import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { AdminBannersController } from './controllers/admin-banners.controller';
import { BannersController } from './controllers/banners.controller';
import { BannersService } from './services/banners.service';

/** F-14 (MODULES.md › BannersModule). */
@Module({
  imports: [FilesModule],
  controllers: [BannersController, AdminBannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
