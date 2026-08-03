import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AppRequest } from '../types/app-request.type';
import { parseLocale, type Locale } from '../utils/locale.util';

/**
 * Reads the caller's storefront language off the `X-Locale` header (set by the
 * frontend API client from its `ustogo-lang` cookie — not `Accept-Language`, which
 * reflects the browser/OS and would drift from the language the user actually
 * selected in the app). Defaults to English when absent or unrecognised, so every
 * handler gets a valid `Locale` with no null-check of its own.
 */
export const CurrentLocale = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Locale => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const header = request.headers['x-locale'];
    const value = Array.isArray(header) ? header[0] : header;
    return parseLocale(value);
  },
);
