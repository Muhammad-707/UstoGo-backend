import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

// Configuration moves to AppConfigService in TODO.md §1.3; until the Zod schema
// exists there is nothing to validate these against, so they stay literals here.
const DEFAULT_PORT = 3000;
const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(API_PREFIX);

  // Readiness must be able to fail before the process stops answering (DEPLOYMENT.md §6).
  app.enableShutdownHooks();

  await app.listen(DEFAULT_PORT);
}

void bootstrap();
