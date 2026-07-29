import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { ACCESS_TOKEN_SCHEME } from '@common/decorators/api-auth.decorator';

export const SWAGGER_PATH = 'api/docs';

/**
 * Tags declared up front so `@ApiTags` on a controller can only reference one that
 * exists, and so the ordering in the UI is a decision rather than an accident of
 * module-registration order (SWAGGER_GUIDE.md §1).
 */
const TAGS: ReadonlyArray<readonly [string, string]> = [
  ['Auth', 'Registration, login, sessions, passwords'],
  ['Users', 'Own profile and account'],
  ['Files', 'Presigned uploads'],
  ['Categories', 'Public category tree'],
  ['Masters', 'Public master discovery'],
  ['Master Cabinet', 'Master self-service (role: MASTER)'],
  ['Bookings', 'Booking lifecycle'],
  ['Reviews', 'Ratings and reviews'],
  ['Notifications', 'In-app notifications'],
  ['Chat', 'Client ↔ master messaging'],
  ['Banners', 'Public promotional content'],
  ['Admin', 'Administration and moderation (role: ADMIN)'],
  ['Health', 'Liveness and readiness'],
];

const SERVERS: ReadonlyArray<readonly [string, string]> = [
  ['http://localhost:3000', 'Local'],
  ['https://api.staging.ustogo.app', 'Staging'],
  ['https://api.ustogo.app', 'Production'],
];

/**
 * Builds the OpenAPI document. Separated from serving it so `swagger:export` can
 * produce the same document without binding a port.
 */
export const buildOpenApiDocument = (app: INestApplication): OpenAPIObject => {
  const builder = new DocumentBuilder()
    .setTitle('UstoGo API')
    .setDescription('Marketplace API connecting clients with professional craftsmen.')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token from /auth/login',
      },
      ACCESS_TOKEN_SCHEME,
    );

  for (const [name, description] of TAGS) {
    builder.addTag(name, description);
  }
  for (const [url, description] of SERVERS) {
    builder.addServer(url, description);
  }

  // operationIdFactory yields the bare method name, which is what makes generated
  // client methods readable — the default prefixes the controller and produces
  // `BookingsController_create` (SWAGGER_GUIDE.md §7).
  return SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
};

/**
 * Mounts the UI at `/api/docs`. The caller decides whether to call this at all —
 * an open schema in production is a free map of the attack surface, so exposure is
 * gated on `SWAGGER_ENABLED` (SWAGGER_GUIDE.md §1).
 */
export const setupSwagger = (app: INestApplication): void => {
  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
    },
    customSiteTitle: 'UstoGo API Docs',
  });
};
