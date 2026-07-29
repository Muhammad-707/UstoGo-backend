import { Prisma } from '@prisma/client';

import type { PrismaService } from '../prisma.service';
import { TransactionManager } from '../transaction.manager';

const writeConflict = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

const notFound = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('not found', {
    code: 'P2025',
    clientVersion: 'test',
  });

// Only $transaction is exercised; the double cast keeps the test from having to
// construct a real PrismaClient and its connection pool.
const managerWith = (transaction: jest.Mock): TransactionManager =>
  new TransactionManager({ db: { $transaction: transaction } } as unknown as PrismaService);

describe('TransactionManager', () => {
  describe('run', () => {
    it('returns the callback result when the transaction succeeds', async () => {
      const transaction = jest.fn().mockResolvedValue('committed');

      await expect(managerWith(transaction).run(() => Promise.resolve('committed'))).resolves.toBe(
        'committed',
      );
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('retries a write conflict and succeeds on a later attempt', async () => {
      const transaction = jest
        .fn()
        .mockRejectedValueOnce(writeConflict())
        .mockResolvedValueOnce('committed');

      await expect(managerWith(transaction).run(() => Promise.resolve('committed'))).resolves.toBe(
        'committed',
      );
      expect(transaction).toHaveBeenCalledTimes(2);
    });

    it('gives up after three attempts and rethrows the conflict', async () => {
      const transaction = jest.fn().mockRejectedValue(writeConflict());

      await expect(
        managerWith(transaction).run(() => Promise.resolve('never')),
      ).rejects.toMatchObject({
        code: 'P2034',
      });
      expect(transaction).toHaveBeenCalledTimes(3);
    });

    // Retrying anything other than a write conflict would re-run a callback that
    // failed for a deterministic reason, turning one error into three.
    it('does not retry an unrelated Prisma error', async () => {
      const transaction = jest.fn().mockRejectedValue(notFound());

      await expect(
        managerWith(transaction).run(() => Promise.resolve('never')),
      ).rejects.toMatchObject({
        code: 'P2025',
      });
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('does not retry a plain error', async () => {
      const transaction = jest.fn().mockRejectedValue(new Error('boom'));

      await expect(managerWith(transaction).run(() => Promise.resolve('never'))).rejects.toThrow(
        'boom',
      );
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('forwards the isolation level to Prisma', async () => {
      const transaction = jest.fn().mockResolvedValue(undefined);

      await managerWith(transaction).run(() => Promise.resolve(undefined), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    // A transaction started from the base client hands the callback an unextended
    // handle, so every read inside it would see soft-deleted rows — the one place
    // DATABASE.md §1's guarantee would silently not hold, and the place it matters
    // most, since uniqueness checks happen inside transactions.
    it('runs on the soft-delete-aware client, not the raw one', async () => {
      const extended = jest.fn().mockResolvedValue('committed');
      const raw = jest.fn().mockResolvedValue('committed');
      const manager = new TransactionManager({
        $transaction: raw,
        db: { $transaction: extended },
      } as unknown as PrismaService);

      await manager.run(() => Promise.resolve('committed'));

      expect(extended).toHaveBeenCalledTimes(1);
      expect(raw).not.toHaveBeenCalled();
    });

    it('omits options that were not supplied rather than passing undefined', async () => {
      const transaction = jest.fn().mockResolvedValue(undefined);

      await managerWith(transaction).run(() => Promise.resolve(undefined));

      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {});
    });
  });
});
