import type { PrismaService } from '@prisma-lib/prisma.service';
import type { StorageProvider } from '@shared/storage/storage.provider';

import { CLEANUP_BATCH_SIZE } from '../../modules/files/constants/file.constants';
import { CleanupUnconfirmedFilesJob } from '../cleanup-unconfirmed-files.job';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const build = (stale: Array<{ id: string; key: string }> = []) => {
  const findMany = jest.fn().mockResolvedValue(stale);
  const deleteMany = jest.fn().mockResolvedValue({ count: stale.length });
  const dbFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    file: { findMany, deleteMany },
    // The filtered client, to prove the job does not use it.
    db: { file: { findMany: dbFindMany, deleteMany: jest.fn() } },
  } as unknown as PrismaService;

  const remove = jest.fn().mockResolvedValue(undefined);
  const storage = { remove } as unknown as StorageProvider;

  return {
    job: new CleanupUnconfirmedFilesJob(prisma, storage),
    findMany,
    deleteMany,
    dbFindMany,
    remove,
  };
};

describe('CleanupUnconfirmedFilesJob', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('does nothing when there is nothing to reclaim', async () => {
    const { job, deleteMany, remove } = build([]);

    await job.run();

    expect(remove).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('removes the object before the row', async () => {
    const order: string[] = [];
    const { job, deleteMany, remove } = build([{ id: 'f1', key: 'avatars/u1/a.jpg' }]);
    remove.mockImplementation(() => {
      order.push('storage');
      return Promise.resolve();
    });
    deleteMany.mockImplementation(() => {
      order.push('database');
      return Promise.resolve({ count: 1 });
    });

    await job.run();

    // A failure between the two must leave a row to retry from, not an orphan object.
    expect(order).toEqual(['storage', 'database']);
  });

  // File is soft-deletable, so the default client hides exactly the rows this job
  // exists to collect.
  it('reads through the unfiltered client', async () => {
    const { job, findMany, dbFindMany } = build([]);

    await job.run();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(dbFindMany).not.toHaveBeenCalled();
  });

  it('collects both abandoned presigns and released files', async () => {
    const { job, findMany } = build([]);

    await job.run();
    const query = firstArg<{ where: { OR: Array<Record<string, unknown>> } }>(findMany);

    expect(query.where.OR).toHaveLength(2);
    expect(query.where.OR[0]).toMatchObject({ isConfirmed: false, deletedAt: null });
    expect(query.where.OR[1]).toMatchObject({ deletedAt: { not: null } });
  });

  it('is bounded, so one pass cannot hold a connection indefinitely', async () => {
    const { job, findMany } = build([]);

    await job.run();

    expect(firstArg<{ take: number }>(findMany).take).toBe(CLEANUP_BATCH_SIZE);
  });

  it('deletes exactly the rows it collected', async () => {
    const { job, deleteMany } = build([
      { id: 'f1', key: 'a' },
      { id: 'f2', key: 'b' },
    ]);

    await job.run();
    const query = firstArg<{ where: { id: { in: string[] } } }>(deleteMany);

    expect(query.where.id.in).toEqual(['f1', 'f2']);
  });
});
