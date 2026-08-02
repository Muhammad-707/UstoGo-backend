import { Injectable } from '@nestjs/common';
import { FilePurpose, UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager, type PrismaTransaction } from '@prisma-lib/transaction.manager';

import { REVOKED_REASON } from '../../auth/constants/auth.constants';
import { TokenService } from '../../auth/services/token.service';
import { FilesService } from '../../files/services/files.service';
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
    private readonly files: FilesService,
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
   * Soft delete, PII anonymisation and a full session revocation, in one transaction
   * (Phase 6 — anonymised deletion, `ROADMAP.md`).
   *
   * The profile is soft-deleted alongside the user so that no read path can surface a
   * profile whose owner is gone. `email`/`phone`/`firstName`/`lastName`/`defaultAddress`/
   * `bio` are overwritten rather than merely hidden — a soft-deleted row is still a row
   * an operator or a database dump can read, and "deleted" has to mean the personal data
   * is actually gone, not just filtered out of normal queries. `email` becomes a
   * deterministic, non-PII placeholder rather than null: it stays `NOT NULL` per
   * `DATABASE.md` §3.1 and unique among placeholders since it is derived from the id.
   * The avatar is released the same way `setAvatar` releases a replaced one. The partial
   * unique indexes mean the *real* address becomes available again for re-registration.
   * Historical bookings and reviews survive with the author's name now reading
   * "Deleted User" wherever it is displayed (BR-5) — a consequence of this overwrite,
   * not a separate redaction step.
   */
  async deleteMe(userId: string): Promise<void> {
    const user = await this.findMe(userId);
    const deletedAt = new Date();
    const anonymisedEmail = `deleted-${userId}@deleted.invalid`;

    const avatarFileId =
      user.clientProfile?.avatarFileId ?? user.masterProfile?.avatarFileId ?? null;

    await this.tx.run(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt, status: UserStatus.INACTIVE, email: anonymisedEmail, phone: null },
      });

      if (user.clientProfile !== null) {
        await tx.clientProfile.update({
          where: { userId },
          data: {
            deletedAt,
            firstName: 'Deleted',
            lastName: 'User',
            defaultAddress: null,
            avatarFileId: null,
          },
        });
      }
      if (user.masterProfile !== null) {
        await tx.masterProfile.update({
          where: { userId },
          data: {
            deletedAt,
            // A deleted master must also leave search, which keys on isActive.
            isActive: false,
            firstName: 'Deleted',
            lastName: 'User',
            displayName: 'Deleted User',
            bio: null,
            avatarFileId: null,
          },
        });
      }

      await this.tokens.revokeAllForUser(userId, REVOKED_REASON.ADMIN_ACTION, tx);
    });

    if (avatarFileId !== null) {
      await this.files.softDelete(avatarFileId);
    }
  }

  /**
   * FR-3.3, step 3. The file must already be confirmed, which is what makes this an
   * attach rather than an upload: the bytes were verified server-side before this
   * endpoint ever saw the id.
   *
   * The previous avatar is soft-deleted so the cleanup job can reclaim its object —
   * replacing a picture should not leave the old one paid for indefinitely.
   */
  async setAvatar(userId: string, fileId: string): Promise<UserWithProfile> {
    const current = await this.findMe(userId);

    await this.files.getAttachable(fileId, userId, FilePurpose.AVATAR);

    const previousId =
      current.masterProfile?.avatarFileId ?? current.clientProfile?.avatarFileId ?? null;

    await this.tx.run(async (tx) => {
      if (current.role === UserRole.MASTER) {
        await tx.masterProfile.update({ where: { userId }, data: { avatarFileId: fileId } });
      } else {
        await tx.clientProfile.update({ where: { userId }, data: { avatarFileId: fileId } });
      }
    });

    if (previousId !== null && previousId !== fileId) {
      await this.files.softDelete(previousId);
    }

    return this.findMe(userId);
  }

  /**
   * Master cover banner — same attach-flow as the avatar, master role only. A client
   * profile has no banner, so a client calling this is rejected up front.
   */
  async setBanner(userId: string, fileId: string): Promise<UserWithProfile> {
    const current = await this.findMe(userId);

    if (current.role !== UserRole.MASTER) {
      throw new FieldNotApplicableException(['bannerFileId'], UserRole.MASTER);
    }

    await this.files.getAttachable(fileId, userId, FilePurpose.BANNER);

    const previousId = current.masterProfile?.bannerFileId ?? null;

    await this.tx.run(async (tx) => {
      await tx.masterProfile.update({ where: { userId }, data: { bannerFileId: fileId } });
    });

    if (previousId !== null && previousId !== fileId) {
      await this.files.softDelete(previousId);
    }

    return this.findMe(userId);
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
