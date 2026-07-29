import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CommandFailedException } from './cli.exceptions';
import { CliModule } from './cli.module';
import { CreateAdminCommand } from './commands/create-admin.command';
import { PROMPTER, type Prompter } from './prompt';

const USAGE = `Usage: npm run cli -- <command> [options]

Commands:
  admin:create [--email=<address>]   Create an administrator account.
                                     The password is always entered interactively.
`;

/** `--email=ops@ustogo.app` → `ops@ustogo.app`. Absent flag → undefined. */
const flag = (argv: readonly string[], name: string): string | undefined => {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));

  return match === undefined ? undefined : match.slice(prefix.length);
};

const run = async (argv: readonly string[]): Promise<void> => {
  const [command] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  if (command !== 'admin:create') {
    throw new CommandFailedException(`Unknown command "${command}".\n\n${USAGE}`);
  }

  if (argv.some((arg) => arg.startsWith('--password'))) {
    throw new CommandFailedException(
      'The password cannot be passed as an argument — it would be visible in ps output, ' +
        'shell history and CI logs. Re-run without it and enter it when prompted.',
    );
  }

  // `logger: false` so that a Prisma connection notice does not interleave with a
  // password prompt. Failures still surface: they are thrown, not logged.
  const context = await NestFactory.createApplicationContext(CliModule, { logger: false });

  try {
    const id = await context.get(CreateAdminCommand).run(flag(argv, 'email'));
    process.stdout.write(`Created administrator ${id}\n`);
  } finally {
    // Closes the readline interface too, or the process would keep stdin open and
    // never exit.
    context.get<Prompter>(PROMPTER).close();
    await context.close();
  }
};

void run(process.argv.slice(2))
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    if (error instanceof CommandFailedException) {
      process.stderr.write(`${error.message}\n`);
    } else {
      // An unexpected failure keeps its stack — that one is a defect report.
      new Logger('cli').error(error);
    }
    process.exitCode = 1;
  });
