import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager, type PrismaTransaction } from '@prisma-lib/transaction.manager';

import { REVOKED_REASON } from '../../auth/constants/auth.constants';
import { TokenService } from '../../auth/services/token.service';
import {
  CLIENT_ONLY_FIELDS,
  MASTER_ONLY_FIELDS,
  type UpdateProfileDto,
} from '../dto/requests/update-profile.dto';
import {
  CityNotFoundException,
  FieldNotApplicableException,
  UserNotFoundException,
} from '../exceptions/users.exceptions';
import { USER_WITH_PROFILE_SELECT, type UserWithProfile } from '../repositories/user.select';

/** Keys shared by both profiles; the rest are dispatched by role. */
const SHARED_PROFILE_FIELDS = ['firstName', 'lastName', 'cityId'] as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly tokens: TokenService,
  ) {}

  /** FR-3.1. The projection is what keeps `passwordHash` out, not a later filter. */
  async findMe(userId: string): Promise<UserWithProfile> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: USER_WITH_PROFILE_SELECT,
    });

    if (user === null) {
      throw new UserNotFoundException();
    }

    return user;
  }

  /**
   * FR-3.2. Email and role are not updatable here, and the DTO has no property for
   * either — a caller cannot express the request at all.
   */
  async updateMe(userId: string, dto: UpdateProfileDto): Promise<UserWithProfile> {
    const current = await this.findMe(userId);

    this.assertFieldsApplicable(current.role, dto);

    if (dto.cityId !== undefined) {
      await this.assertCityExists(dto.cityId);
    }

    await this.tx.run(async (tx) => {
      if (dto.phone !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { phone: dto.phone } });
      }
      await this.updateProfile(tx, current, dto);
    });

    return this.findMe(userId);
  }

  /**
   * Soft delete plus a full session revocation, in one transaction.
   *
   * The profile is soft-deleted alongside the user so that no read path can surface a
   * profile whose owner is gone. The partial unique indexes mean the address becomes
   * available again, which is the documented intent (DATABASE.md §3.1) — historical
   * bookings and reviews survive, with the author shown as a redacted placeholder
   * (BR-5).
   */
  async deleteMe(userId: string): Promise<void> {
    const user = await this.findMe(userId);
    const deletedAt = new Date();

    await this.tx.run(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt, status: UserStatus.INACTIVE },
      });

      if (user.clientProfile !== null) {
        await tx.clientProfile.update({ where: { userId }, data: { deletedAt } });
      }
      if (user.masterProfile !== null) {
        await tx.masterProfile.update({
          where: { userId },
          // A deleted master must also leave search, which keys on isActive.
          data: { deletedAt, isActive: false },
        });
      }

      await this.tokens.revokeAllForUser(userId, REVOKED_REASON.ADMIN_ACTION, tx);
    });
  }

  private assertFieldsApplicable(role: UserRole, dto: UpdateProfileDto): void {
    const forbidden = role === UserRole.MASTER ? CLIENT_ONLY_FIELDS : MASTER_ONLY_FIELDS;
    const supplied = forbidden.filter((field) => dto[field] !== undefined);

    if (supplied.length > 0) {
      throw new FieldNotApplicableException(supplied, role);
    }
  }

  private async updateProfile(
    tx: PrismaTransaction,
    current: UserWithProfile,
    dto: UpdateProfileDto,
  ): Promise<void> {
    const shared = pick(dto, SHARED_PROFILE_FIELDS);

    if (current.role === UserRole.MASTER) {
      await tx.masterProfile.update({
        where: { userId: current.id },
        data: { ...shared, ...pick(dto, MASTER_ONLY_FIELDS) },
      });
      return;
    }

    await tx.clientProfile.update({
      where: { userId: current.id },
      data: { ...shared, ...pick(dto, CLIENT_ONLY_FIELDS) },
    });
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.db.city.findFirst({ where: { id: cityId, isActive: true } });

    if (city === null) {
      throw new CityNotFoundException();
    }
  }
}

/**
 * Copies only the keys that were actually supplied.
 *
 * A partial update must distinguish "not sent" from "sent as null": spreading the DTO
 * wholesale would write `undefined` over columns the caller never mentioned, and with
 * `exactOptionalPropertyTypes` that is a type error rather than a silent one.
 */
const pick = <T extends object, K extends readonly (keyof T)[]>(
  source: T,
  keys: K,
): Partial<Pick<T, K[number]>> => {
  const result: Partial<Pick<T, K[number]>> = {};

  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
};
