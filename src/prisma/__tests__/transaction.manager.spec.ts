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

    // Prisma surfaces Postgres's deadlock and serialization failure inside an
    // interactive transaction as an unknown request error with the SQLSTATE in the
    // message rather than a P2034 code. Retrying it is what turns the concurrent
    // accept race (BOOKINGS.md §7.1) into the loser's 409 instead of a 500.
    it.each(['40P01', '40001'])(
      'retries a %s SQLSTATE surfaced as an unknown raw error',
      async (sqlstate) => {
        const deadlock = (): Prisma.PrismaClientUnknownRequestError =>
          new Prisma.PrismaClientUnknownRequestError(
            `Error occurred during query execution:\nConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "${sqlstate}", message: "deadlock detected", severity: "ERROR" }) })`,
            { clientVersion: 'test' },
          );
        const transaction = jest
          .fn()
          .mockRejectedValueOnce(deadlock())
          .mockResolvedValueOnce('committed');

        await expect(
          managerWith(transaction).run(() => Promise.resolve('committed')),
        ).resolves.toBe('committed');
        expect(transaction).toHaveBeenCalledTimes(2);
      },
    );

    it('does not retry an unknown raw error without a write-conflict SQLSTATE', async () => {
      const transaction = jest.fn().mockRejectedValue(
        new Prisma.PrismaClientUnknownRequestError('something else went wrong', {
          clientVersion: 'test',
        }),
      );

      await expect(
        managerWith(transaction).run(() => Promise.resolve('never')),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
      expect(transaction).toHaveBeenCalledTimes(1);
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
