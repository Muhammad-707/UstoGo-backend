import { Inject, Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { AUTH } from '../../modules/auth/constants/auth.constants';
import { PASSWORD_PATTERN, PASSWORD_RULE } from '../../modules/auth/dto/requests/credentials.dto';
import { PasswordService } from '../../modules/auth/services/password.service';
import { CommandFailedException } from '../cli.exceptions';
import { PROMPTER, type Prompter } from '../prompt';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 255;

/**
 * Creates the `ADMIN` account that no HTTP route can create.
 *
 * `USER_ROLES.md` §3 forbids an admin registration endpoint, and `PROJECT_RULES.md`
 * forbids seeding one with a known password. This command is therefore the only path
 * to an administrator, which is why it insists on an interactive password: an argv
 * value is visible in `ps`, in shell history and in any CI log that echoes the command
 * (`AUTHENTICATION.md` §5).
 */
@Injectable()
export class CreateAdminCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(PROMPTER) private readonly prompter: Prompter,
  ) {}

  async run(rawEmail: string | undefined): Promise<string> {
    const email = this.normaliseEmail(
      rawEmail ?? (await this.prompter.ask('Administrator email: ')),
    );

    // Checked before the password is asked for, so a typo in the address does not cost
    // the operator two careful password entries.
    await this.assertEmailAvailable(email);

    const password = await this.readPassword();
    const passwordHash = await this.passwords.hash(password);

    const admin = await this.prisma.db.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });

    return admin.id;
  }

  private normaliseEmail(value: string): string {
    // The same normalisation registration applies, because the column is `citext` and
    // an address that differs only in case or padding is the same account.
    const email = value.trim().toLowerCase();

    if (email.length === 0) {
      throw new CommandFailedException('An email address is required.');
    }
    if (email.length > MAX_EMAIL_LENGTH) {
      throw new CommandFailedException(`The email must be at most ${MAX_EMAIL_LENGTH} characters.`);
    }
    if (!EMAIL.test(email)) {
      throw new CommandFailedException(`"${email}" is not a valid email address.`);
    }

    return email;
  }

  /**
   * Live rows only, matching the partial unique indexes: a soft-deleted account
   * releases its address, so refusing on one would refuse a re-creation the database
   * would have accepted.
   */
  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.db.user.findFirst({
      where: { email },
      select: { role: true },
    });

    if (existing !== null) {
      throw new CommandFailedException(
        `An account already exists for ${email} (role ${existing.role}).`,
      );
    }
  }

  /**
   * Asked twice and compared, because the input is not echoed — a mistyped password
   * would otherwise lock the only account that can administer the platform, with no
   * self-service reset that does not depend on an administrator existing.
   */
  private async readPassword(): Promise<string> {
    const password = await this.prompter.askSecret('Password: ');

    this.assertPasswordAcceptable(password);

    const confirmation = await this.prompter.askSecret('Confirm password: ');

    if (password !== confirmation) {
      throw new CommandFailedException('The passwords did not match.');
    }

    return password;
  }

  /** The policy from `AUTHENTICATION.md` §7, applied to the account that needs it most. */
  private assertPasswordAcceptable(password: string): void {
    if (password.length < AUTH.MIN_PASSWORD_LENGTH) {
      throw new CommandFailedException(
        `The password must be at least ${String(AUTH.MIN_PASSWORD_LENGTH)} characters.`,
      );
    }
    // Bytes, not characters: bcrypt truncates at 72 bytes, and a non-ASCII password
    // reaches that boundary sooner than its length suggests.
    if (Buffer.byteLength(password, 'utf8') > AUTH.MAX_PASSWORD_BYTES) {
      throw new CommandFailedException(
        `The password must be at most ${String(AUTH.MAX_PASSWORD_BYTES)} bytes.`,
      );
    }
    if (!PASSWORD_PATTERN.test(password)) {
      throw new CommandFailedException(`The password ${PASSWORD_RULE}.`);
    }
  }
}
