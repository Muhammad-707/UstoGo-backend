import type { AppRequest } from '@common/types/app-request.type';

import type { SessionContext } from '../services/token.service';

/** Forensic context for the session row (DATABASE.md §4.1). */
export const sessionContext = (request: AppRequest): SessionContext => ({
  userAgent: request.header('user-agent'),
  ipAddress: request.ip,
});
