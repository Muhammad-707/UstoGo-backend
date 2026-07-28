import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { TransactionManager } from './transaction.manager';

/**
 * Global: every feature module needs database access, and making each one import
 * PrismaModule would add a line of ceremony per module and no isolation
 * (MODULES.md › PrismaModule).
 */
@Global()
@Module({
  providers: [PrismaService, TransactionManager],
  exports: [PrismaService, TransactionManager],
})
export class PrismaModule {}
