import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { buildOpenApiDocument } from './swagger';

const OUTPUT = resolve(process.cwd(), 'openapi.json');

/**
 * Writes `openapi.json` without binding a port (SWAGGER_GUIDE.md §7).
 *
 * `NestFactory.create` builds the module graph and registers routes but does not run
 * lifecycle hooks — `app.init()` does that — so no database connection is opened and
 * this runs in CI against a container-less job. Configuration is still validated,
 * because ConfigModule's provider factory runs during construction; the export
 * therefore needs the same environment variables as the application.
 *
 * The document is committed and diffed in CI so that an unintended breaking change to
 * the public contract arrives as a reviewable diff instead of a client-side surprise.
 */
const main = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    const document = buildOpenApiDocument(app);
    writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

    // Written straight to stdout: the app logger is switched off above so that Nest's
    // startup chatter stays out of a script whose entire output is one line, and a
    // suppressed logger would swallow this line too.
    const pathCount = Object.keys(document.paths).length;
    process.stdout.write(`Wrote ${OUTPUT} (${String(pathCount)} paths)\n`);
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  process.stderr.write(`OpenAPI export failed: ${String(error)}\n`);
  process.exitCode = 1;
});
