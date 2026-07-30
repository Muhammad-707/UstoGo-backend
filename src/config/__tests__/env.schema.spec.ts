import { parseEnv } from '../env.schema';
import { InvalidEnvironmentException } from '../invalid-environment.exception';
import { validEnv } from './env.fixture';

const expectIssue = (source: Record<string, string | undefined>, fragment: string): void => {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidEnvironmentException);
    expect((error as InvalidEnvironmentException).issues.join('\n')).toContain(fragment);
    return;
  }
  throw new Error(`expected parseEnv to reject with an issue containing "${fragment}"`);
};

describe('parseEnv', () => {
  describe('a valid environment', () => {
    it('returns the parsed values', () => {
      const env = parseEnv(validEnv());

      expect(env.DATABASE_URL).toBe(
        'postgresql://ustogo:ustogo@localhost:5432/ustogo?schema=public',
      );
      expect(env.S3_BUCKET).toBe('ustogo-local');
    });

    it('applies the documented defaults for anything omitted', () => {
      const env = parseEnv(validEnv());

      expect(env.NODE_ENV).toBe('development');
      expect(env.PORT).toBe(3000);
      expect(env.API_PREFIX).toBe('api/v1');
      expect(env.JWT_ACCESS_TTL).toBe('15m');
      expect(env.JWT_REFRESH_TTL).toBe('30d');
      expect(env.BCRYPT_ROUNDS).toBe(12);
      expect(env.PASSWORD_RESET_TTL).toBe('30m');
      expect(env.THROTTLE_LIMIT).toBe(100);
      expect(env.S3_PRESIGN_TTL).toBe(900);
    });

    it('coerces numeric variables from their string form', () => {
      const env = parseEnv(validEnv({ PORT: '8080', BCRYPT_ROUNDS: '13' }));

      expect(env.PORT).toBe(8080);
      expect(env.BCRYPT_ROUNDS).toBe(13);
    });

    it('freezes the result so configuration cannot drift at runtime', () => {
      expect(Object.isFrozen(parseEnv(validEnv()))).toBe(true);
    });
  });

  describe('secrets', () => {
    it('rejects a missing access private key', () => {
      expectIssue(validEnv({ JWT_ACCESS_PRIVATE_KEY: undefined }), 'JWT_ACCESS_PRIVATE_KEY');
    });

    it('rejects a refresh secret shorter than 32 characters', () => {
      expectIssue(
        validEnv({ JWT_REFRESH_SECRET: 'short' }),
        'JWT_REFRESH_SECRET: must be at least 32 characters',
      );
    });

    it('rejects a value that does not decode to a PEM private key', () => {
      expectIssue(
        validEnv({ JWT_ACCESS_PRIVATE_KEY: Buffer.from('not a pem').toString('base64') }),
        'JWT_ACCESS_PRIVATE_KEY: must be a base64-encoded PEM PRIVATE KEY',
      );
    });

    it('rejects an access public key identical to the private key', () => {
      const env = validEnv();

      expectIssue(
        validEnv({ JWT_ACCESS_PUBLIC_KEY: env.JWT_ACCESS_PRIVATE_KEY }),
        'JWT_ACCESS_PUBLIC_KEY: must differ from JWT_ACCESS_PRIVATE_KEY',
      );
    });

    it('never echoes a secret value into the failure report', () => {
      const secret = 'too-short';

      try {
        parseEnv(validEnv({ JWT_REFRESH_SECRET: secret }));
        throw new Error('expected parseEnv to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidEnvironmentException);
        expect((error as InvalidEnvironmentException).message).not.toContain(secret);
      }
    });
  });

  describe('urls', () => {
    it('rejects a malformed DATABASE_URL', () => {
      expectIssue(validEnv({ DATABASE_URL: 'not-a-url' }), 'DATABASE_URL');
    });

    it('rejects a DATABASE_URL that is a valid URL but the wrong scheme', () => {
      expectIssue(
        validEnv({ DATABASE_URL: 'mysql://user:pass@localhost:3306/ustogo' }),
        'DATABASE_URL: must be a postgresql:// connection URL',
      );
    });

    it('reports one issue per bad url, not one per failed check', () => {
      try {
        parseEnv(validEnv({ DATABASE_URL: 'not-a-url' }));
        throw new Error('expected parseEnv to reject');
      } catch (error) {
        expect((error as InvalidEnvironmentException).issues).toHaveLength(1);
      }
    });

    it('accepts the postgres:// alias', () => {
      expect(() =>
        parseEnv(validEnv({ DATABASE_URL: 'postgres://ustogo:ustogo@localhost:5432/ustogo' })),
      ).not.toThrow();
    });

    it('rejects a malformed REDIS_URL', () => {
      expectIssue(validEnv({ REDIS_URL: 'localhost:6379' }), 'REDIS_URL');
    });

    it('rejects a malformed S3_ENDPOINT', () => {
      expectIssue(validEnv({ S3_ENDPOINT: '//localhost:9000' }), 'S3_ENDPOINT');
    });
  });

  describe('booleans', () => {
    // z.coerce.boolean() would read "false" as true, silently enabling Swagger in
    // production. This is the regression test for that specific trap.
    it('reads SWAGGER_ENABLED="false" as false', () => {
      expect(parseEnv(validEnv({ SWAGGER_ENABLED: 'false' })).SWAGGER_ENABLED).toBe(false);
    });

    it('reads SWAGGER_ENABLED="true" as true', () => {
      expect(parseEnv(validEnv({ SWAGGER_ENABLED: 'true' })).SWAGGER_ENABLED).toBe(true);
    });

    it('rejects an ambiguous boolean rather than guessing', () => {
      expectIssue(validEnv({ SWAGGER_ENABLED: 'yes' }), 'SWAGGER_ENABLED');
    });
  });

  describe('durations', () => {
    it('accepts the documented duration format', () => {
      expect(parseEnv(validEnv({ JWT_ACCESS_TTL: '900s' })).JWT_ACCESS_TTL).toBe('900s');
    });

    it('rejects a duration without a unit', () => {
      expectIssue(
        validEnv({ JWT_ACCESS_TTL: '15' }),
        'JWT_ACCESS_TTL: must be a duration such as 15m, 24h or 30d',
      );
    });
  });

  describe('production guards', () => {
    it('rejects a wildcard CORS origin in production', () => {
      expectIssue(
        validEnv({ NODE_ENV: 'production', CORS_ORIGINS: '*' }),
        'CORS_ORIGINS: must not be * in production',
      );
    });

    it('permits a wildcard CORS origin outside production', () => {
      expect(() =>
        parseEnv(validEnv({ NODE_ENV: 'development', CORS_ORIGINS: '*' })),
      ).not.toThrow();
    });

    it('rejects bcrypt rounds below the documented floor', () => {
      expectIssue(validEnv({ BCRYPT_ROUNDS: '4' }), 'BCRYPT_ROUNDS');
    });
  });

  describe('the failure report', () => {
    it('lists every problem at once rather than the first', () => {
      try {
        parseEnv(
          validEnv({
            JWT_ACCESS_PRIVATE_KEY: undefined,
            DATABASE_URL: 'not-a-url',
            S3_BUCKET: undefined,
          }),
        );
        throw new Error('expected parseEnv to reject');
      } catch (error) {
        const { issues } = error as InvalidEnvironmentException;

        expect(issues).toHaveLength(3);
        expect(issues.join('\n')).toContain('JWT_ACCESS_PRIVATE_KEY');
        expect(issues.join('\n')).toContain('DATABASE_URL');
        expect(issues.join('\n')).toContain('S3_BUCKET');
      }
    });

    it('reports a root-level failure that has no variable name to attach to', () => {
      try {
        parseEnv('not-an-environment' as unknown as Record<string, string | undefined>);
        throw new Error('expected parseEnv to reject');
      } catch (error) {
        const { issues } = error as InvalidEnvironmentException;

        expect(issues).toHaveLength(1);
        // Reported bare, with no "VARIABLE_NAME: " prefix, because there is no
        // single variable to blame.
        expect(issues[0]).not.toMatch(/^[A-Z][A-Z0-9_]*: /);
      }
    });

    it('tells the reader how to fix it', () => {
      try {
        parseEnv({});
        throw new Error('expected parseEnv to reject');
      } catch (error) {
        expect((error as Error).message).toContain('Copy .env.example to .env');
      }
    });
  });
});
