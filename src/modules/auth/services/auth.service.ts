import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRole, UserStatus, type User } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager, type PrismaTransaction } from '@prisma-lib/transaction.manager';

import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { TokenService, type SessionContext, type TokenPair } from './token.service';
import { TwoFactorService } from './two-factor.service';
import { REVOKED_REASON } from '../constants/auth.constants';
import type { RegisterClientDto } from '../dto/requests/register-client.dto';
import type { RegisterMasterDto } from '../dto/requests/register-master.dto';
import {
  AUTH_EVENT,
  MasterRegisteredEvent,
  PasswordChangedEvent,
  UserRegisteredEvent,
} from '../events/auth.events';
import {
  AccountBlockedException,
  AccountInactiveException,
  CityNotFoundException,
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  PasswordReusedException,
  PhoneAlreadyExistsException,
} from '../exceptions/auth.exceptions';

export type AuthResult = {
  readonly user: User;
  readonly tokens: TokenPair;
};

/**
 * `login`'s result: a real session, or — for an admin with TOTP enabled — a challenge
 * to exchange at `POST /auth/2fa/verify` instead (`TwoFactorService`).
 */
export type LoginResult =
  | ({ readonly twoFactorRequired: false } & AuthResult)
  | { readonly twoFactorRequired: true; readonly challengeToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly events: EventEmitter2,
    private readonly emailVerification: EmailVerificationService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /**
   * FR-1.1. The role is a literal constant here and is never read from the request —
   * `RegisterClientDto` has no `role` property, so the validation whitelist rejects one
   * before this runs, and this line is why there is no code path to an ADMIN at all.
   */
  async registerClient(dto: RegisterClientDto, context: SessionContext): Promise<AuthResult> {
    await this.assertIdentifiersAvailable(dto.email, dto.phone);

    const passwordHash = await this.passwords.hash(dto.password);
    if (dto.cityId !== undefined) {
      await this.assertCityExists(dto.cityId);
    }

    const { user, profileId } = await this.tx.run(async (tx) => {
      const created = await this.createUser(tx, {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: UserRole.CLIENT,
      });

      const profile = await tx.clientProfile.create({
        data: {
          userId: created.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(dto.cityId !== undefined ? { cityId: dto.cityId } : {}),
        },
      });

      return { user: created, profileId: profile.id };
    });

    // Emitted after commit — a welcome message for a rolled-back registration is
    // worse than a missing one (ARCHITECTURE.md §5).
    this.events.emit(AUTH_EVENT.USER_REGISTERED, new UserRegisteredEvent(user.id, profileId));
    await this.emailVerification.issue(user);

    return { user, tokens: await this.tokens.issuePair(user, context) };
  }

  /** FR-1.2. The profile is created PENDING and inactive; only an admin changes that. */
  async registerMaster(dto: RegisterMasterDto, context: SessionContext): Promise<AuthResult> {
    await this.assertIdentifiersAvailable(dto.email, dto.phone);
    await this.assertCityExists(dto.cityId);

    const passwordHash = await this.passwords.hash(dto.password);

    const { user, profileId } = await this.tx.run(async (tx) => {
      const created = await this.createUser(tx, {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: UserRole.MASTER,
      });

      const profile = await tx.masterProfile.create({
        data: {
          userId: created.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          displayName: dto.displayName,
          cityId: dto.cityId,
          timezone: dto.timezone,
          // P0: the registration phone *is* the WhatsApp number clients write to —
          // the master can change it later via PATCH /users/me (24-hour cooldown).
          whatsappPhone: dto.phone,
          ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
          ...(dto.yearsOfExperience !== undefined
            ? { yearsOfExperience: dto.yearsOfExperience }
            : {}),
        },
      });

      return { user: created, profileId: profile.id };
    });

    this.events.emit(AUTH_EVENT.MASTER_REGISTERED, new MasterRegisteredEvent(user.id, profileId));
    await this.emailVerification.issue(user);

    return { user, tokens: await this.tokens.issuePair(user, context) };
  }

  /**
   * FR-2.1. Unknown email and wrong password are indistinguishable — same status, same
   * body, comparable latency (AUTHENTICATION.md §6).
   *
   * Account state is checked only *after* the password verifies. Checking it first
   * would make `ACCOUNT_BLOCKED` an oracle: it would confirm the address is registered
   * to anyone who guessed a password wrong.
   */
  async login(email: string, password: string, context: SessionContext): Promise<LoginResult> {
    const user = await this.prisma.db.user.findFirst({ where: { email } });

    if (user === null) {
      await this.passwords.verifyAgainstDummy(password);
      throw new InvalidCredentialsException();
    }

    if (!(await this.passwords.verify(password, user.passwordHash))) {
      throw new InvalidCredentialsException();
    }

    this.assertAccountUsable(user);

    // Second factor required: no session yet, only a short-lived challenge exchanged
    // at POST /auth/2fa/verify once the TOTP code also checks out.
    if (user.totpEnabledAt !== null) {
      return {
        twoFactorRequired: true,
        challengeToken: await this.twoFactor.issueChallenge(user.id),
      };
    }

    const tokens = await this.tokens.issuePair(user, context);
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { twoFactorRequired: false, user, tokens };
  }

  /**
   * Changes the caller's password and drops every other session
   * (AUTHENTICATION.md §4). The caller's own family survives, so changing a password
   * does not log you out of the device you changed it on.
   */
  async changePassword(
    userId: string,
    familyId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw new InvalidCredentialsException();
    }

    if (await this.passwords.verify(newPassword, user.passwordHash)) {
      throw new PasswordReusedException();
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.tx.run(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.tokens.revokeAllExceptFamily(
        userId,
        familyId,
        REVOKED_REASON.PASSWORD_CHANGED,
        tx,
      );
    });

    this.events.emit(AUTH_EVENT.PASSWORD_CHANGED, new PasswordChangedEvent(userId));
  }

  private assertAccountUsable(user: User): void {
    if (user.status === UserStatus.BLOCKED) {
      throw new AccountBlockedException();
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new AccountInactiveException();
    }
  }

  /**
   * Checked before the transaction so a duplicate costs one indexed read rather than a
   * rolled-back insert. The partial unique indexes remain the real guarantee: two
   * concurrent registrations both pass this check, and the second fails at the
   * constraint, which the Prisma error mapper turns into the same 409.
   */
  private async assertIdentifiersAvailable(email: string, phone?: string): Promise<void> {
    const existing = await this.prisma.db.user.findFirst({
      where: phone !== undefined ? { OR: [{ email }, { phone }] } : { email },
      select: { email: true, phone: true },
    });

    if (existing === null) {
      return;
    }

    throw existing.email === email
      ? new EmailAlreadyExistsException()
      : new PhoneAlreadyExistsException();
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.db.city.findFirst({ where: { id: cityId, isActive: true } });

    if (city === null) {
      throw new CityNotFoundException();
    }
  }

  private async createUser(
    tx: PrismaTransaction,
    identity: {
      email: string;
      phone: string | undefined;
      passwordHash: string;
      role: UserRole;
    },
  ): Promise<User> {
    return tx.user.create({
      data: {
        email: identity.email,
        passwordHash: identity.passwordHash,
        role: identity.role,
        status: UserStatus.ACTIVE,
        ...(identity.phone !== undefined ? { phone: identity.phone } : {}),
      },
    });
  }
}
