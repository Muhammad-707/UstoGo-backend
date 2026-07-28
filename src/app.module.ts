import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root module. Feature modules are registered here as they land, in the order
 * given by docs/ROADMAP.md — the wiring is the only thing this module owns.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
})
export class AppModule {}
