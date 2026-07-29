import { createInterface, type Interface } from 'node:readline';

import { CommandFailedException } from './cli.exceptions';

/**
 * Terminal input for the CLI, kept behind an interface so a command can be tested
 * without a TTY. The real implementation is the only place in the process that reads
 * stdin.
 */
export type Prompter = {
  ask(question: string): Promise<string>;
  askSecret(question: string): Promise<string>;
  close(): void;
};

export const PROMPTER = Symbol('Prompter');

/**
 * Reads answers from stdin, one readline interface for the whole session.
 *
 * Lines are consumed from a queue fed by the `line` event rather than by calling
 * `rl.question` per prompt. Two reasons, both of which bit the straightforward version:
 *
 *   - closing an interface ends the underlying stdin stream, so a per-question
 *     interface makes the *second* question read EOF and return empty — which for this
 *     command means an empty confirmation silently mismatching a correct password;
 *   - when input is piped rather than typed, readline emits every buffered line at
 *     once. `rl.question` consumes only the first, and the rest are dropped, so the
 *     next prompt waits forever for a line that has already been and gone.
 *
 * End of input rejects any pending question instead of hanging. A command that stops
 * responding is the worst of the available failures: it looks like a slow database.
 */
export class TerminalPrompter implements Prompter {
  private rl: Interface | undefined;
  private readonly pending: Array<(line: string) => void> = [];
  private readonly buffered: string[] = [];
  private ended = false;

  async ask(question: string): Promise<string> {
    process.stdout.write(question);

    return this.nextLine();
  }

  /**
   * Reads a secret without echoing it.
   *
   * `readline` has no hidden-input mode, so the echo is suppressed by intercepting the
   * output stream's writes for the duration of the question. The characters still reach
   * the interface — only the echo is dropped — so editing keys behave as usual.
   *
   * The prompt itself is written before muting, or it would be swallowed too.
   */
  async askSecret(question: string): Promise<string> {
    const output = process.stdout;
    const originalWrite = output.write.bind(output);

    output.write(question);
    Object.defineProperty(output, 'write', {
      configurable: true,
      writable: true,
      value: (): boolean => true,
    });

    try {
      return await this.nextLine();
    } finally {
      Object.defineProperty(output, 'write', {
        configurable: true,
        writable: true,
        value: originalWrite,
      });
      // The newline the user's Enter would have echoed, so the next line starts clean.
      output.write('\n');
    }
  }

  close(): void {
    this.rl?.close();
    this.rl = undefined;
  }

  private async nextLine(): Promise<string> {
    this.start();

    const ready = this.buffered.shift();

    if (ready !== undefined) {
      return ready;
    }
    if (this.ended) {
      throw new CommandFailedException('Input ended before the command had everything it needed.');
    }

    return new Promise<string>((resolve) => {
      this.pending.push(resolve);
    });
  }

  private start(): void {
    if (this.rl !== undefined) {
      return;
    }

    // `terminal: false`: the echo is handled here, and letting readline redraw the line
    // as well would print the secret back after it had been muted.
    this.rl = createInterface({ input: process.stdin, terminal: false });

    this.rl.on('line', (line: string) => {
      const waiting = this.pending.shift();

      if (waiting === undefined) {
        this.buffered.push(line);
      } else {
        waiting(line);
      }
    });

    this.rl.on('close', () => {
      this.ended = true;
      // Resolving empty rather than rejecting: the caller validates what it got, and an
      // empty password fails its own policy check with a message about the password
      // rather than about the stream.
      while (this.pending.length > 0) {
        this.pending.shift()?.('');
      }
    });
  }
}
