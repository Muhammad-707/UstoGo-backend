import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import type { AppRequest } from '../types/app-request.type';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Bounded so a client cannot push an unbounded string into every log line. */
const MAX_INBOUND_LENGTH = 200;
const SAFE_ID = /^[\w.:-]+$/;

/**
 * Derives the correlation id for a request (ERROR_HANDLING.md §1, API.md §1.7).
 *
 * An inbound `X-Request-Id` is honoured so a trace survives across services, but it is
 * validated first: the value is echoed into response headers and log lines, and an
 * unvalidated one is a log-injection and header-splitting vector.
 *
 * Exported because two callers need identical behaviour — this middleware, and the
 * logger's `genReqId` hook. pino-http computes its per-request log bindings inside its
 * own middleware, before any Nest middleware has run, so if the logger did not derive
 * the id itself every structured line would carry `requestId: "unknown"`.
 */
export const resolveRequestId = (inbound: string | undefined): string =>
  inbound !== undefined && inbound.length <= MAX_INBOUND_LENGTH && SAFE_ID.test(inbound)
    ? inbound
    : randomUUID();

/**
 * Guarantees the correlation id and the response header regardless of how logging is
 * configured. Idempotent: when the logger has already derived the id, this reuses it
 * rather than minting a second one for the same request.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: AppRequest, response: Response, next: NextFunction): void {
    const requestId = request.requestId ?? resolveRequestId(request.header(REQUEST_ID_HEADER));

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
