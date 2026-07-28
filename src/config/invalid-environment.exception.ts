/**
 * Thrown when the environment fails schema validation at boot.
 *
 * Deliberately not an `AppException`: those map to HTTP responses, and this error
 * exists precisely because there will never be an HTTP listener to respond with.
 *
 * The message carries variable *names* and the reason each failed, never the value —
 * a validation report that echoes `JWT_ACCESS_SECRET` into the logs is a secret leak
 * (`SECURITY.md`), and it is invariably the shortest secrets that fail validation.
 */
export class InvalidEnvironmentException extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(
      [
        'Invalid environment configuration:',
        ...issues.map((issue) => `  - ${issue}`),
        '',
        'Copy .env.example to .env and fill in the missing values.',
      ].join('\n'),
    );
    this.name = 'InvalidEnvironmentException';
  }
}
