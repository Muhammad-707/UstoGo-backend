import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { AdminCategoriesController } from './controllers/admin-categories.controller';
import { CategoriesController } from './controllers/categories.controller';
import { CategoriesService } from './services/categories.service';

/** F-05 (MODULES.md › CategoriesModule). */
@Module({
  imports: [FilesModule],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
