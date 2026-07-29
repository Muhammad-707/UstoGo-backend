import { Module } from '@nestjs/common';

import { FilesController } from './controllers/files.controller';
import { FilesService } from './services/files.service';

/** F-13 (MODULES.md › FilesModule). StorageModule is global, so nothing is imported. */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
