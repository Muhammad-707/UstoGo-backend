/**
 * A command refusing its input for a reason the operator can act on.
 *
 * Distinct from an unexpected error so the entry point can print a plain message and
 * exit, rather than a stack trace: "the passwords did not match" is not a defect
 * report, and burying it in a trace trains operators to ignore traces that matter.
 */
export class CommandFailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandFailedException';
  }
}
