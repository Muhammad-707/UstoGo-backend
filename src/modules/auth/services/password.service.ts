import { randomBytes } from 'node:crypto';

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

import { AppConfigService } from '@config/app-config.service';

/**
 * bcrypt, at the configured cost (AUTHENTICATION.md §1, §7).
 *
 * `bcryptjs` rather than the native `bcrypt`: the runtime image installs with
 * `--ignore-scripts`, and native bcrypt's binary is fetched by exactly such a script.
 * The pure-JS implementation produces the same `$2b$` hashes and needs no build
 * toolchain in the image. It is slower, which is bounded by the login rate limit.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  /**
   * A throwaway hash compared against when no user matches the supplied email.
   *
   * Derived from the configured cost rather than hard-coded, because the cost is baked
   * into a bcrypt hash string: a literal at cost 12 compared while `BCRYPT_ROUNDS=14`
   * would return measurably faster than a real comparison, and response latency would
   * become the enumeration oracle that the dummy comparison exists to prevent.
   *
   * The plaintext behind it is random and discarded, so it is never a usable credential.
   */
  private dummyHash = '';

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(32).toString('hex'), this.config.jwt.bcryptRounds);
  }

  async hash(plain: string): Promise<string> {
    return hash(plain, this.config.jwt.bcryptRounds);
  }

  async verify(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }

  /**
   * Burns the same work a real verification would, and always fails.
   *
   * Called on the "no such user" branch of login so that the unknown-email and
   * wrong-password paths have comparable latency (AUTHENTICATION.md §6).
   */
  async verifyAgainstDummy(plain: string): Promise<void> {
    await compare(plain, this.dummyHash);
  }
}
