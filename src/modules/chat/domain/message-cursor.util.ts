/**
 * Cursor pagination over `(createdAt DESC, id DESC)` — the index backing
 * `GET /conversations/:id/messages` (DATABASE.md §9.2). `createdAt` alone is not a
 * stable tie-break: two messages can share a millisecond, and without `id` a page
 * boundary that lands between them would either skip or repeat one.
 */
export type MessageCursor = {
  readonly createdAt: string;
  readonly id: string;
};

export const encodeMessageCursor = (cursor: MessageCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

/** Returns `undefined` for a cursor that is missing, malformed, or tampered with —
 *  treated as "start from the top" rather than as an error, since an opaque cursor
 *  carries no validation contract a client could have violated on purpose. */
export const decodeMessageCursor = (raw: string | undefined): MessageCursor | undefined => {
  if (raw === undefined) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>).createdAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return parsed as MessageCursor;
    }

    return undefined;
  } catch {
    return undefined;
  }
};
