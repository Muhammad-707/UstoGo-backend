import { Global, Module } from '@nestjs/common';

import { AppConfigService } from './app-config.service';
import { loadEnv } from './load-env';

/**
 * Global so that no other module has to import it to read configuration, and so there
 * is exactly one parsed environment per process.
 *
 * The factory runs while Nest resolves providers — that is, during `NestFactory.create`
 * and therefore before `app.listen`. Invalid configuration cannot reach a bound port
 * (`MODULES.md` › ConfigModule).
 */
@Global()
@Module({
  providers: [
    {
      provide: AppConfigService,
      useFactory: (): AppConfigService => new AppConfigService(loadEnv()),
    },
  ],
  exports: [AppConfigService],
})
export class ConfigModule {}
