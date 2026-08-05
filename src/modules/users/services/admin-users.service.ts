import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { REVOKED_REASON } from '../../auth/constants/auth.constants';
import { TokenService } from '../../auth/services/token.service';
import type { AdminUserQueryDto } from '../dto/requests/admin-user-query.dto';
import {
  UserAlreadyInStatusException,
  UserNotFoundException,
} from '../exceptions/users.exceptions';
import { USER_WITH_PROFILE_SELECT, type UserWithProfile } from '../repositories/user.select';

const LIST_SELECT = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  clientProfile: { select: { firstName: true, lastName: true } },
  masterProfile: { select: { displayName: true } },
} as const satisfies Prisma.UserSelect;

/**
 * §6.11 (MASTER_PROMPT.md): the admin dashboard had no way to browse the user base or
 * block a bad actor outside a direct SQL statement — `User.status` already had
 * `BLOCKED` and `AuthService.login` already rejected it, but nothing ever set it.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly transactionManager: TransactionManager,
  ) {}

  async list(
    query: AdminUserQueryDto,
  ): Promise<{ items: Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>[]; total: number }> {
    const where = this.whereFor(query);

    const [items, total] = await Promise.all([
      this.prisma.db.user.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.user.count({ where }),
    ]);

    return { items, total };
  }

  async getById(userId: string): Promise<UserWithProfile> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: USER_WITH_PROFILE_SELECT,
    });
    if (user === null) {
      throw new UserNotFoundException();
    }
    return user;
  }

  /** Blocking revokes every session, the same way `UsersService.delete` does — a
   *  blocked account that keeps a live access token could still use the API for the
   *  ~15 minutes until it expires. */
  async block(userId: string): Promise<UserWithProfile> {
    const user = await this.getById(userId);
    if (user.status === UserStatus.BLOCKED) {
      throw new UserAlreadyInStatusException(UserStatus.BLOCKED);
    }

    await this.transactionManager.run(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: UserStatus.BLOCKED } });
      await this.tokens.revokeAllForUser(userId, REVOKED_REASON.ADMIN_ACTION, tx);
    });

    return this.getById(userId);
  }

  async unblock(userId: string): Promise<UserWithProfile> {
    const user = await this.getById(userId);
    if (user.status !== UserStatus.BLOCKED) {
      throw new UserAlreadyInStatusException(user.status);
    }

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });

    return this.getById(userId);
  }

  private whereFor(query: AdminUserQueryDto): Prisma.UserWhereInput {
    const conditions: Prisma.UserWhereInput[] = [];

    if (query.role !== undefined) {
      conditions.push({ role: query.role });
    }
    if (query.status !== undefined) {
      conditions.push({ status: query.status });
    }
    if (query.cityId !== undefined) {
      conditions.push({
        OR: [
          { clientProfile: { cityId: query.cityId } },
          { masterProfile: { cityId: query.cityId } },
        ],
      });
    }
    if (query.search !== undefined) {
      conditions.push({
        OR: [
          { email: { contains: query.search } },
          { clientProfile: { firstName: { contains: query.search, mode: 'insensitive' } } },
          { clientProfile: { lastName: { contains: query.search, mode: 'insensitive' } } },
          { masterProfile: { displayName: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.registeredFrom !== undefined || query.registeredTo !== undefined) {
      conditions.push({
        createdAt: {
          ...(query.registeredFrom === undefined ? {} : { gte: new Date(query.registeredFrom) }),
          ...(query.registeredTo === undefined ? {} : { lte: new Date(query.registeredTo) }),
        },
      });
    }

    return conditions.length === 0 ? {} : { AND: conditions };
  }
}
