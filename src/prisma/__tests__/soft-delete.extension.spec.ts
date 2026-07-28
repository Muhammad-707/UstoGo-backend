import {
  applyNotDeleted,
  shouldFilter,
  FILTERED_OPERATIONS,
  SOFT_DELETABLE_MODELS,
} from '../extensions/soft-delete.extension';

describe('softDeleteExtension', () => {
  describe('shouldFilter', () => {
    it.each([...SOFT_DELETABLE_MODELS])('filters reads on %s', (model) => {
      expect(shouldFilter(model, 'findMany')).toBe(true);
    });

    it.each(['City', 'RefreshToken', 'PasswordResetToken'])(
      'leaves %s alone — it has no deletedAt column',
      (model) => {
        expect(shouldFilter(model, 'findMany')).toBe(false);
      },
    );

    it.each([...FILTERED_OPERATIONS])('filters the %s operation', (operation) => {
      expect(shouldFilter('User', operation)).toBe(true);
    });

    // Writes must still reach deleted rows: soft-deleting is itself an update, and
    // restoring one would be impossible if updates could not see it.
    it.each(['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'])(
      'leaves the %s operation alone',
      (operation) => {
        expect(shouldFilter('User', operation)).toBe(false);
      },
    );

    it('handles an undefined model', () => {
      expect(shouldFilter(undefined, 'findMany')).toBe(false);
    });
  });

  describe('applyNotDeleted', () => {
    it('adds deletedAt: null when there is no where clause at all', () => {
      expect(applyNotDeleted({})).toEqual({ where: { deletedAt: null } });
    });

    it('adds deletedAt: null when args are undefined', () => {
      expect(applyNotDeleted(undefined)).toEqual({ where: { deletedAt: null } });
    });

    it('preserves the existing where clause', () => {
      expect(applyNotDeleted({ where: { email: 'a@b.c' } })).toEqual({
        where: { email: 'a@b.c', deletedAt: null },
      });
    });

    it('preserves sibling arguments such as select and take', () => {
      expect(applyNotDeleted({ where: { id: '1' }, select: { id: true }, take: 10 })).toEqual({
        where: { id: '1', deletedAt: null },
        select: { id: true },
        take: 10,
      });
    });

    // This is the seam withDeleted() repository variants rely on. Without it the
    // extension would make deleted rows unreachable rather than merely hidden.
    it('does not override an explicit deletedAt filter', () => {
      expect(applyNotDeleted({ where: { deletedAt: { not: null } } })).toEqual({
        where: { deletedAt: { not: null } },
      });
    });

    it('respects an explicit deletedAt of null without duplicating it', () => {
      expect(applyNotDeleted({ where: { deletedAt: null, id: '1' } })).toEqual({
        where: { deletedAt: null, id: '1' },
      });
    });

    it('does not mutate the arguments it was given', () => {
      const args = { where: { id: '1' } };

      applyNotDeleted(args);

      expect(args).toEqual({ where: { id: '1' } });
    });
  });
});
