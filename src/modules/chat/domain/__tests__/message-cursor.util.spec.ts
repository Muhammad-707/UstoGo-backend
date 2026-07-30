import { decodeMessageCursor, encodeMessageCursor } from '../message-cursor.util';

describe('message-cursor.util', () => {
  it('round-trips a cursor', () => {
    const cursor = { createdAt: '2026-07-30T10:00:00.000Z', id: 'abc-123' };

    expect(decodeMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor);
  });

  it('treats a missing cursor as the start of the list', () => {
    expect(decodeMessageCursor(undefined)).toBeUndefined();
  });

  it('treats a malformed cursor as the start of the list rather than an error', () => {
    expect(decodeMessageCursor('not-base64url-json')).toBeUndefined();
  });

  it('treats a well-formed but foreign shape as the start of the list', () => {
    const foreign = Buffer.from(JSON.stringify({ page: 3 }), 'utf8').toString('base64url');

    expect(decodeMessageCursor(foreign)).toBeUndefined();
  });
});
