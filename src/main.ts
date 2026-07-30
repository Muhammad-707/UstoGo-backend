import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { setupSwagger, SWAGGER_PATH } from './bootstrap/swagger';
import { AppConfigService } from './config/app-config.service';
import { InvalidEnvironmentException } from './config/invalid-environment.exception';
import { loadEnv } from './config/load-env';
import { RedisIoAdapter } from './modules/chat/gateway/redis-io.adapter';

/**
 * Operational probes stay off the versioned prefix. The container HEALTHCHECK
 * (DEPLOYMENT.md §4) and the external uptime probe (§8) both target `/health`, and a
 * probe URL that moves when the API is versioned breaks every deployment that
 * hard-codes it.
 */
const UNVERSIONED_ROUTES = ['health', 'health/ready'];

async function bootstrap(): Promise<void> {
  // Validated before Nest is constructed, deliberately. Left to ConfigModule's provider
  // factory, the failure surfaces inside dependency injection, where Nest's own
  // ExceptionHandler logs it with a DI stack trace before this file can format it — and
  // an operator staring at `Injector.instantiateClass` learns nothing about which
  // variable is wrong. The result is memoised, so ConfigModule reuses this parse.
  loadEnv();

  // bufferLogs holds anything logged during bootstrap until the Pino logger is
  // installed, so early lines keep the same format and redaction as everything else.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const { app: appConfig } = app.get(AppConfigService);

  app.setGlobalPrefix(appConfig.apiPrefix, { exclude: UNVERSIONED_ROUTES });

  // Fans `/chat` Socket.io events out across every instance (ARCHITECTURE.md §7);
  // must be installed before `listen()` creates the underlying `Server`.
  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  if (appConfig.swaggerEnabled) {
    setupSwagger(app);
  }

  // Readiness must be able to fail before the process stops answering (DEPLOYMENT.md §6).
  app.enableShutdownHooks();

  await app.listen(appConfig.port);

  Logger.log(
    `Listening on http://localhost:${String(appConfig.port)}/${appConfig.apiPrefix} [${appConfig.nodeEnv}]`,
    'Bootstrap',
  );
  Logger.log(
    appConfig.swaggerEnabled
      ? `API docs at http://localhost:${String(appConfig.port)}/${SWAGGER_PATH}`
      : 'API docs disabled (SWAGGER_ENABLED=false)',
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
