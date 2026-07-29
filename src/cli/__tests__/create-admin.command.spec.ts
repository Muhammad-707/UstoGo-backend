import { UserRole, UserStatus } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import type { PasswordService } from '../../modules/auth/services/password.service';
import { CommandFailedException } from '../cli.exceptions';
import { CreateAdminCommand } from '../commands/create-admin.command';
import type { Prompter } from '../prompt';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const VALID = 'correcthorse7';

const build = (
  options: { existing?: { role: UserRole } | null; secrets?: string[]; answers?: string[] } = {},
) => {
  const findFirst = jest.fn().mockResolvedValue(options.existing ?? null);
  const create = jest.fn().mockResolvedValue({ id: 'admin-1' });
  const prisma = { db: { user: { findFirst, create } } } as unknown as PrismaService;

  const hash = jest.fn().mockResolvedValue('$2b$12$hashed');
  const passwords = { hash } as unknown as PasswordService;

  const secrets = [...(options.secrets ?? [VALID, VALID])];
  const answers = [...(options.answers ?? [])];
  const askSecret = jest.fn().mockImplementation(() => Promise.resolve(secrets.shift() ?? ''));
  const ask = jest.fn().mockImplementation(() => Promise.resolve(answers.shift() ?? ''));
  const prompter = { ask, askSecret, close: jest.fn() } as unknown as Prompter;

  return {
    command: new CreateAdminCommand(prisma, passwords, prompter),
    findFirst,
    create,
    hash,
    ask,
    askSecret,
  };
};

describe('CreateAdminCommand', () => {
  it('creates an active admin and returns its id', async () => {
    const { command, create } = build();

    await expect(command.run('ops@ustogo.app')).resolves.toBe('admin-1');

    const args = firstArg<{ data: Record<string, unknown> }>(create);
    expect(args.data).toMatchObject({
      email: 'ops@ustogo.app',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: '$2b$12$hashed',
    });
  });

  // The role that no HTTP route can produce is the whole point of the command.
  it('stores only the hash, never the plaintext', async () => {
    const { command, create, hash } = build();

    await command.run('ops@ustogo.app');

    expect(hash).toHaveBeenCalledWith(VALID);
    expect(JSON.stringify(firstArg(create))).not.toContain(VALID);
  });

  it('asks for the email when the flag is absent', async () => {
    const { command, ask, create } = build({ answers: ['typed@ustogo.app'] });

    await command.run(undefined);

    expect(ask).toHaveBeenCalledTimes(1);
    expect(firstArg<{ data: { email: string } }>(create).data.email).toBe('typed@ustogo.app');
  });

  // The column is citext, so an address differing only in case is the same account.
  it('normalises the email before use', async () => {
    const { command, create, findFirst } = build();

    await command.run('  OPS@UstoGo.App  ');

    expect(firstArg<{ where: { email: string } }>(findFirst).where.email).toBe('ops@ustogo.app');
    expect(firstArg<{ data: { email: string } }>(create).data.email).toBe('ops@ustogo.app');
  });

  it.each(['', '   ', 'not-an-email', 'missing@tld', `${'a'.repeat(250)}@example.com`])(
    'refuses the email %p',
    async (email) => {
      const { command, create } = build();

      await expect(command.run(email)).rejects.toBeInstanceOf(CommandFailedException);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('refuses an address that is already taken', async () => {
    const { command, create } = build({ existing: { role: UserRole.CLIENT } });

    await expect(command.run('taken@ustogo.app')).rejects.toThrow(/already exists/);
    expect(create).not.toHaveBeenCalled();
  });

  // A typo in the address should not cost the operator two blind password entries.
  it('checks the address before asking for a password', async () => {
    const { command, askSecret } = build({ existing: { role: UserRole.ADMIN } });

    await expect(command.run('taken@ustogo.app')).rejects.toBeInstanceOf(CommandFailedException);
    expect(askSecret).not.toHaveBeenCalled();
  });

  describe('password policy', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['short1', 'at least 8'],
      ['alllettersnodigits', 'letter and one digit'],
      ['12345678901234', 'letter and one digit'],
      [`${'ä'.repeat(40)}1a`, 'at most 72 bytes'],
    ];

    it.each(cases)('refuses %p', async (password, message) => {
      const { command, create } = build({ secrets: [password, password] });

      await expect(command.run('ops@ustogo.app')).rejects.toThrow(new RegExp(message));
      expect(create).not.toHaveBeenCalled();
    });

    // Bytes, not characters: bcrypt truncates at 72 bytes and a two-byte character
    // reaches that boundary at 36 characters.
    it('measures the maximum in bytes', () => {
      const long = `${'ä'.repeat(40)}1a`;

      expect(long.length).toBeLessThan(72);
      expect(Buffer.byteLength(long, 'utf8')).toBeGreaterThan(72);
    });

    it('accepts a password at exactly the minimum length', async () => {
      const { command } = build({ secrets: ['abcdefg1', 'abcdefg1'] });

      await expect(command.run('ops@ustogo.app')).resolves.toBe('admin-1');
    });
  });

  // Input is not echoed, so a typo would otherwise lock the only account that can
  // administer the platform.
  it('requires the password twice and rejects a mismatch', async () => {
    const { command, create, askSecret } = build({ secrets: [VALID, 'correcthorse8'] });

    await expect(command.run('ops@ustogo.app')).rejects.toThrow(/did not match/);
    expect(askSecret).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });
});
