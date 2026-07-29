import { ApprovalStatus, UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';

import { PasswordService } from '@modules/auth/services/password.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import type { TestApp } from './test-app.factory';
import {
  clientRegistration,
  masterRegistration,
  uniqueEmail,
  VALID_PASSWORD,
} from '../fixtures/user.fixture';

export type Actor = {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly accessToken: string;
  readonly refreshToken: string;
};

type AuthBody = {
  user: { id: string; email: string; role: UserRole };
  accessToken: string;
  refreshToken: string;
};

const toActor = (body: AuthBody): Actor => ({
  id: body.user.id,
  email: body.user.email,
  role: body.user.role,
  accessToken: body.accessToken,
  refreshToken: body.refreshToken,
});

/** Any active city; the fixtures need one and which one is never the point of a test. */
export const anyCityId = async (prisma: PrismaService): Promise<string> => {
  const city = await prisma.db.city.findFirst({ where: { isActive: true }, select: { id: true } });

  if (city === null) {
    throw new Error('No city is seeded. The e2e suite seeds reference data before running.');
  }

  return city.id;
};

export const createClient = async (
  { server }: TestApp,
  overrides: Partial<ReturnType<typeof clientRegistration>> = {},
): Promise<Actor> => {
  const response = await request(server)
    .post('/api/v1/auth/register/client')
    .send(clientRegistration(overrides))
    .expect(201);

  return toActor(response.body as AuthBody);
};

/**
 * A master that has been through moderation.
 *
 * Registration leaves the profile `PENDING`, and the approval endpoint arrives with
 * F-04 in Phase 2 — so the state is set directly here. That is the honest version: a
 * helper that pretended to approve through an endpoint which does not exist would have
 * to be rewritten the moment it does.
 */
export const createApprovedMaster = async (app: TestApp, cityId: string): Promise<Actor> => {
  const registration = masterRegistration(cityId);

  const response = await request(app.server)
    .post('/api/v1/auth/register/master')
    .send(registration)
    .expect(201);

  const actor = toActor(response.body as AuthBody);

  await app.prisma.db.masterProfile.update({
    where: { userId: actor.id },
    data: { approvalStatus: ApprovalStatus.APPROVED, isActive: true, approvedAt: new Date() },
  });

  return actor;
};

/** A master left as registration created it: `PENDING` and invisible. */
export const createPendingMaster = async (app: TestApp, cityId: string): Promise<Actor> => {
  const response = await request(app.server)
    .post('/api/v1/auth/register/master')
    .send(masterRegistration(cityId))
    .expect(201);

  return toActor(response.body as AuthBody);
};

/**
 * No HTTP path creates an administrator, by design (FR-1.3) — the row is written
 * directly, exactly as `admin:create` does, and then logged in through the real
 * endpoint so the token is one the application actually issued.
 */
export const createAdmin = async (app: TestApp): Promise<Actor> => {
  const email = uniqueEmail('admin');
  const passwords = app.app.get(PasswordService);

  await app.prisma.db.user.create({
    data: {
      email,
      passwordHash: await passwords.hash(VALID_PASSWORD),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  return login(app, email, VALID_PASSWORD);
};

export const login = async (
  { server }: TestApp,
  email: string,
  password: string,
): Promise<Actor> => {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return toActor(response.body as AuthBody);
};

export const bearer = (actor: Actor): string => `Bearer ${actor.accessToken}`;
