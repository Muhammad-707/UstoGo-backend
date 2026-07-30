import { Prisma } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  IdempotencyKeyInProgressException,
  IdempotencyKeyReusedException,
} from '../../exceptions/idempotency.exceptions';
import { IdempotencyService } from '../idempotency.service';

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });

const build = (options: { createError?: unknown; existing?: unknown } = {}) => {
  const create = options.createError
    ? jest.fn().mockRejectedValue(options.createError)
    : jest.fn().mockResolvedValue({});
  const findUniqueOrThrow = jest.fn().mockResolvedValue(options.existing);
  const update = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });

  const idempotencyKey = { create, findUniqueOrThrow, update, deleteMany };
  const prisma = { db: { idempotencyKey } } as unknown as PrismaService;

  return { service: new IdempotencyService(prisma), create, findUniqueOrThrow, update, deleteMany };
};

const REQUEST = {
  userId: 'u1',
  key: 'key-1',
  method: 'POST',
  path: '/api/v1/bookings',
  requestHash: 'h1',
};

describe('IdempotencyService.begin', () => {
  it('returns null (proceed) when the key is new', async () => {
    const { service, create } = build();

    const result = await service.begin(REQUEST);

    expect(result).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rethrows an error that is not a unique-constraint violation', async () => {
    const { service } = build({ createError: new Error('boom') });

    await expect(service.begin(REQUEST)).rejects.toThrow('boom');
  });

  it('replays the stored response for a genuine retry', async () => {
    const { service } = build({
      createError: uniqueViolation(),
      existing: { ...REQUEST, responseStatus: 201, responseBody: { id: 'b1' } },
    });

    const result = await service.begin(REQUEST);

    expect(result).toEqual({ status: 201, body: { id: 'b1' } });
  });

  it('rejects a key reused for a request with a different hash', async () => {
    const { service } = build({
      createError: uniqueViolation(),
      existing: { ...REQUEST, requestHash: 'different', responseStatus: 201, responseBody: {} },
    });

    await expect(service.begin(REQUEST)).rejects.toBeInstanceOf(IdempotencyKeyReusedException);
  });

  it('rejects a key reused for a different method or path', async () => {
    const { service } = build({
      createError: uniqueViolation(),
      existing: { ...REQUEST, path: '/api/v1/reviews', responseStatus: 201, responseBody: {} },
    });

    await expect(service.begin(REQUEST)).rejects.toBeInstanceOf(IdempotencyKeyReusedException);
  });

  it('reports in-progress when the original request has not completed', async () => {
    const { service } = build({
      createError: uniqueViolation(),
      existing: { ...REQUEST, responseStatus: null, responseBody: null },
    });

    await expect(service.begin(REQUEST)).rejects.toBeInstanceOf(IdempotencyKeyInProgressException);
  });
});

describe('IdempotencyService.complete / abandon', () => {
  it('stores the response keyed by user and key', async () => {
    const { service, update } = build();

    await service.complete('u1', 'key-1', 201, { id: 'b1' });

    expect(update).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'u1', key: 'key-1' } },
      data: { responseStatus: 201, responseBody: { id: 'b1' } },
    });
  });

  it('deletes only the still-pending placeholder on failure', async () => {
    const { service, deleteMany } = build();

    await service.abandon('u1', 'key-1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', key: 'key-1', responseStatus: null },
    });
  });
});
