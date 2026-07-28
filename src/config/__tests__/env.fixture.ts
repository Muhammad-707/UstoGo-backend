/**
 * A minimal environment that passes validation. Tests override only the variable under
 * test, so the intent of each case is visible in the diff (TESTING.md §8).
 */
export const validEnv = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => ({
  DATABASE_URL: 'postgresql://ustogo:ustogo@localhost:5432/ustogo?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'ustogo-local',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
  MAIL_HOST: 'localhost',
  MAIL_FROM: 'UstoGo <no-reply@ustogo.app>',
  REDIS_URL: 'redis://localhost:6379',
  ...overrides,
});
