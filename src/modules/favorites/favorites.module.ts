import { Module } from '@nestjs/common';

import { MastersModule } from '@modules/masters/masters.module';

import { FavoritesController } from './controllers/favorites.controller';
import { FavoritesService } from './services/favorites.service';

/** A client's saved masters list. */
@Module({
  imports: [MastersModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
