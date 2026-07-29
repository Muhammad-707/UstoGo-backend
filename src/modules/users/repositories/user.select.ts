import { Prisma } from '@prisma/client';

/**
 * The projection every read of a user goes through.
 *
 * `passwordHash` is excluded **structurally**, not filtered out afterwards: because
 * this is a `select`, the row Prisma returns has no such property and neither does its
 * inferred type. A response DTO cannot leak a field that was never fetched, and a
 * future mapper cannot accidentally copy one (DATABASE.md §3.1, FR-3.1).
 *
 * `satisfies` rather than a type annotation keeps the literal keys, which is what makes
 * the returned type precise instead of `Partial<User>`.
 */
export const USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export const CLIENT_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  cityId: true,
  defaultAddress: true,
} as const satisfies Prisma.ClientProfileSelect;

/**
 * `rejectionReason` is included: it is the master's own moderation feedback and they
 * need it to resubmit. Nothing here is an internal moderation note — those live in the
 * audit log, which this projection deliberately does not reach.
 */
export const MASTER_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  bio: true,
  yearsOfExperience: true,
  cityId: true,
  serviceRadiusKm: true,
  timezone: true,
  approvalStatus: true,
  rejectionReason: true,
  approvedAt: true,
  isActive: true,
  ratingAverage: true,
  ratingCount: true,
  completedBookingsCount: true,
} as const satisfies Prisma.MasterProfileSelect;

/** One round trip for the user and whichever profile their role implies. */
export const USER_WITH_PROFILE_SELECT = {
  ...USER_SELECT,
  clientProfile: { select: CLIENT_PROFILE_SELECT },
  masterProfile: { select: MASTER_PROFILE_SELECT },
} as const satisfies Prisma.UserSelect;

export type UserWithProfile = Prisma.UserGetPayload<{
  select: typeof USER_WITH_PROFILE_SELECT;
}>;
