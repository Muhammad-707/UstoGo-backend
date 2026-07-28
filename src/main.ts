import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { InvalidEnvironmentException } from './config/invalid-environment.exception';
import { loadEnv } from './config/load-env';

async function bootstrap(): Promise<void> {
  // Validated before Nest is constructed, deliberately. Left to ConfigModule's provider
  // factory, the failure surfaces inside dependency injection, where Nest's own
  // ExceptionHandler logs it with a DI stack trace before this file can format it — and
  // an operator staring at `Injector.instantiateClass` learns nothing about which
  // variable is wrong. The result is memoised, so ConfigModule reuses this parse.
  loadEnv();

  const app = await NestFactory.create(AppModule);
  const { app: appConfig } = app.get(AppConfigService);

  app.setGlobalPrefix(appConfig.apiPrefix);

  // Readiness must be able to fail before the process stops answering (DEPLOYMENT.md §6).
  app.enableShutdownHooks();

  await app.listen(appConfig.port);

  Logger.log(
    `Listening on http://localhost:${appConfig.port}/${appConfig.apiPrefix} [${appConfig.nodeEnv}]`,
    'Bootstrap',
  );
}

void bootstrap().catch((error: unknown) => {
  // A configuration failure is an operator error, not a crash: the stack trace tells
  // them nothing they can act on, whereas the list of bad variables tells them exactly
  // what to fix. Everything else keeps its stack.
  if (error instanceof InvalidEnvironmentException) {
    Logger.error(error.message, undefined, 'Bootstrap');
  } else {
    Logger.error('Application failed to start', error, 'Bootstrap');
  }

  process.exitCode = 1;
});
