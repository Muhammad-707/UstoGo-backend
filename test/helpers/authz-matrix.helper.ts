import { UserRole } from '@prisma/client';
import request from 'supertest';

import type { Actor } from './auth.helper';
import type { TestApp } from './test-app.factory';

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export type AuthzContext = {
  /** The actor the resource belongs to, or who is otherwise entitled to the response. */
  readonly owner: Actor;
  /** An actor of the same role who is entitled to nothing here. */
  readonly stranger: Actor;
  /** An actor whose role is not on the allowed list, when one applies. */
  readonly wrongRole?: Actor;
  readonly path: string;
  /** The path as the stranger would address it — a resource they do not own. */
  readonly foreignPath?: string;
};

export type AuthzMatrixSpec = {
  readonly method: HttpMethod;
  readonly describe: string;
  /** Roles permitted by `USER_ROLES.md`; omit when every authenticated role may call it. */
  readonly allowedRoles?: readonly UserRole[];
  /** Fields that must never appear in the response, at any depth. */
  readonly forbiddenFields?: readonly string[];
  readonly expectedOwnerStatus?: number;
  /** Sent with every request in the matrix, for methods that need a valid body. */
  readonly body?: Record<string, unknown>;
  /** Built per test run, after the fixtures for that suite exist. */
  context(app: TestApp): Promise<AuthzContext>;
};

const FORBIDDEN_BY_DEFAULT = ['passwordHash', 'tokenHash', 'refreshToken'] as const;

/** Walks the whole response, since over-exposure is usually one level deeper than expected. */
const findForbidden = (value: unknown, forbidden: readonly string[], path = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbidden(item, forbidden, `${path}[${index}]`));
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const here = path === '' ? key : `${path}.${key}`;

    return [...(forbidden.includes(key) ? [here] : []), ...findForbidden(nested, forbidden, here)];
  });
};

/**
 * The six assertions every protected endpoint must satisfy (`TESTING.md` §6,
 * `AUTHORIZATION.md` §8).
 *
 * Generated from one spec rather than written per endpoint, because the case that gets
 * forgotten is never the happy path — it is the foreign resource returning 403 instead
 * of 404, which confirms to an attacker that the id exists. A shared helper cannot be
 * forgotten selectively.
 */
export const describeAuthzMatrix = (spec: AuthzMatrixSpec, appFor: () => TestApp): void => {
  describe(`authorization · ${spec.describe}`, () => {
    let ctx: AuthzContext;
    let app: TestApp;

    beforeEach(async () => {
      app = appFor();
      ctx = await spec.context(app);
    });

    const send = (path: string, token?: string): request.Test => {
      const test = request(app.server)[spec.method](path);

      if (token !== undefined) {
        void test.set('Authorization', `Bearer ${token}`);
      }
      if (spec.body !== undefined) {
        void test.send(spec.body);
      }

      return test;
    };

    it('401 without a token', async () => {
      await send(ctx.path).expect(401);
    });

    it('401 with a malformed token', async () => {
      await send(ctx.path, 'not-a-jwt').expect(401);
    });

    it('401 with a well-formed token that was not issued here', async () => {
      // Correct three-part shape, wrong signature: proves the signature is verified and
      // not merely that the header parses.
      const forged = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(
        '{"sub":"00000000-0000-4000-8000-000000000000"}',
      ).toString('base64url')}.c2lnbmF0dXJl`;

      await send(ctx.path, forged).expect(401);
    });

    if (spec.allowedRoles !== undefined) {
      it('403 for a role that may not call this', async () => {
        if (ctx.wrongRole === undefined) {
          throw new Error('allowedRoles was declared but the context supplied no wrongRole actor.');
        }

        expect(spec.allowedRoles).not.toContain(ctx.wrongRole.role);
        await send(ctx.path, ctx.wrongRole.accessToken).expect(403);
      });
    }

    it("404 — not 403 — for another user's resource", async () => {
      if (ctx.foreignPath === undefined) {
        return;
      }

      const response = await send(ctx.foreignPath, ctx.stranger.accessToken);

      // 403 would confirm the id exists to someone who may not see it, which is the
      // whole distinction AUTHORIZATION.md §1 draws.
      expect(response.status).toBe(404);
    });

    it('succeeds for the owner without over-exposing fields', async () => {
      const response = await send(ctx.path, ctx.owner.accessToken).expect(
        spec.expectedOwnerStatus ?? 200,
      );

      const forbidden = [...FORBIDDEN_BY_DEFAULT, ...(spec.forbiddenFields ?? [])];

      expect(findForbidden(response.body, forbidden)).toEqual([]);
    });
  });
};
