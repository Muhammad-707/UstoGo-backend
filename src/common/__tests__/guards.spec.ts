import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ForbiddenException, UnauthorizedException } from '../exceptions/generic.exceptions';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const contextWith = (user?: unknown): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (value: unknown): Reflector =>
  ({ getAllAndOverride: () => value }) as unknown as Reflector;

describe('RolesGuard', () => {
  it('allows a caller holding a required role', () => {
    const guard = new RolesGuard(reflectorReturning(['MASTER', 'ADMIN']));

    expect(guard.canActivate(contextWith({ role: 'MASTER' }))).toBe(true);
  });

  it('rejects a caller without one', () => {
    const guard = new RolesGuard(reflectorReturning(['ADMIN']));

    expect(() => guard.canActivate(contextWith({ role: 'CLIENT' }))).toThrow(ForbiddenException);
  });

  // Absence means "any authenticated role", which is safe because JwtAuthGuard has
  // already run (AUTHORIZATION.md §2.2).
  it.each([
    ['no metadata', undefined],
    ['an empty list', []],
  ])('treats %s as any authenticated role', (_label, metadata) => {
    const guard = new RolesGuard(reflectorReturning(metadata));

    expect(guard.canActivate(contextWith({ role: 'CLIENT' }))).toBe(true);
  });

  it('rejects when a role is required but nobody is authenticated', () => {
    const guard = new RolesGuard(reflectorReturning(['ADMIN']));

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard', () => {
  describe('@Public()', () => {
    it('lets a public route through without consulting passport', () => {
      const guard = new JwtAuthGuard(reflectorReturning(true));

      expect(guard.canActivate(contextWith())).toBe(true);
    });

    it('uses the metadata key the decorator writes', () => {
      const getAllAndOverride = jest.fn().mockReturnValue(true);
      const guard = new JwtAuthGuard({ getAllAndOverride } as unknown as Reflector);

      void guard.canActivate(contextWith());

      expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, expect.anything());
    });
  });

  describe('handleRequest', () => {
    const guard = new JwtAuthGuard(reflectorReturning(false));

    it('returns the user when authentication succeeded', () => {
      expect(guard.handleRequest(null, { id: 'u1' })).toEqual({ id: 'u1' });
    });

    it.each([
      ['false', false],
      ['null', null],
      ['undefined', undefined],
    ])('raises UNAUTHORIZED when passport yields %s', (_label, user) => {
      expect(() => guard.handleRequest(null, user)).toThrow(UnauthorizedException);
    });

    // A strategy that threw for its own reason — a database failure inside validate,
    // say — must surface as that failure, not as a 401 claiming bad credentials.
    it('rethrows a strategy error rather than masking it as a 401', () => {
      const boom = new Error('database unreachable');

      expect(() => guard.handleRequest(boom, false)).toThrow(boom);
    });
  });
});
