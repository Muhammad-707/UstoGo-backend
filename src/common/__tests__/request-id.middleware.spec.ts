import type { NextFunction, Request, Response } from 'express';

import { RequestIdMiddleware, resolveRequestId } from '../middleware/request-id.middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it.each(['abc123', 'trace-42', 'a.b:c', '01J9X4K7QW8ZP2'])('honours the safe id %p', (id) => {
    expect(resolveRequestId(id)).toBe(id);
  });

  it('generates one when the header is absent', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
  });

  // The value is echoed into a response header and into every log line, so an
  // unvalidated one is a header-splitting and log-injection vector.
  it.each([
    ['spaces', 'has spaces'],
    ['newline', 'a\r\nInjected: header'],
    ['quote', 'a"b'],
    ['empty', ''],
    ['too long', 'x'.repeat(201)],
  ])('rejects and replaces an unsafe id (%s)', (_label, id) => {
    const resolved = resolveRequestId(id);

    expect(resolved).not.toBe(id);
    expect(resolved).toMatch(UUID);
  });

  it('accepts an id exactly at the length cap', () => {
    const id = 'x'.repeat(200);

    expect(resolveRequestId(id)).toBe(id);
  });
});

describe('RequestIdMiddleware', () => {
  const run = (
    request: Partial<Request> & { headers?: Record<string, string> },
  ): { request: Request; setHeader: jest.Mock; next: jest.Mock } => {
    const setHeader = jest.fn();
    const next = jest.fn();
    const req = {
      header: (name: string) => request.headers?.[name.toLowerCase()],
      ...request,
    } as unknown as Request;

    new RequestIdMiddleware().use(req, { setHeader } as unknown as Response, next as NextFunction);

    return { request: req, setHeader, next };
  };

  it('sets the id on the request and echoes it in the response header', () => {
    const { request, setHeader } = run({ headers: { 'x-request-id': 'trace-7' } });

    expect(request.requestId).toBe('trace-7');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-7');
  });

  it('generates an id when none was supplied', () => {
    expect(run({ headers: {} }).request.requestId).toMatch(UUID);
  });

  // The logger derives the id first via genReqId; minting a second one here would put
  // two different ids on the same request.
  it('reuses an id the logger already derived', () => {
    const { request, setHeader } = run({ requestId: 'already-set', headers: {} });

    expect(request.requestId).toBe('already-set');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'already-set');
  });

  it('always continues the chain', () => {
    expect(run({ headers: {} }).next).toHaveBeenCalledTimes(1);
  });
});
