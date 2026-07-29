import { Global, Module, RequestMethod } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { REQUEST_ID_HEADER, resolveRequestId } from '@common/middleware/request-id.middleware';
import type { AppRequest } from '@common/types/app-request.type';
import { AppConfigService } from '@config/app-config.service';

/**
 * The central redaction list (ERROR_HANDLING.md §6, MODULES.md › LoggerModule).
 *
 * Centralised on purpose: redaction applied at call sites is redaction that eventually
 * misses one, and the line it misses is the one carrying a password. pino applies these
 * paths to every object it serialises, so a secret cannot escape through a log line
 * added later by someone who never read this file.
 */
export const REDACTED_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'resetToken',
  '*.password',
  '*.passwordHash',
  '*.tokenHash',
  '*.accessToken',
  '*.refreshToken',
];

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // nestjs-pino registers its middleware on '*' by default, which Express 5's
        // path-to-regexp only accepts through a deprecation shim that warns twice on
        // every boot. Naming the catch-all explicitly silences it and keeps the app
        // off a shim that a future major will remove.
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
        pinoHttp: {
          level: config.app.logLevel,
          redact: { paths: [...REDACTED_PATHS], censor: '[REDACTED]' },

          // genReqId runs before pino-http computes its per-request bindings, which is
          // the only point early enough for customProps to see the id. Deriving it here
          // and stashing it on the request also means RequestIdMiddleware finds it
          // already set and reuses it, so both agree on one value per request.
          genReqId: (request: unknown) => {
            const typed = request as AppRequest;
            typed.requestId ??= resolveRequestId(typed.header(REQUEST_ID_HEADER));
            return typed.requestId;
          },

          // Correlates every line with the error envelope and the X-Request-Id header.
          customProps: (request: unknown) => ({
            requestId: (request as AppRequest).requestId ?? 'unknown',
          }),

          // Structured JSON in every deployed environment — it is machine-parsed there.
          // pino-pretty is a development convenience and is a dev dependency, so it must
          // never be reached in production.
          ...(config.app.isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
                },
              }),

          // Health probes fire every few seconds and would otherwise dominate the log.
          autoLogging: {
            ignore: (request: unknown) => {
              return (request as AppRequest).url.startsWith('/health');
            },
          },
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
