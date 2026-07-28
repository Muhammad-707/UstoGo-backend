import { AppConfigService } from '../app-config.service';
import { parseEnv } from '../env.schema';
import { validEnv } from './env.fixture';

const serviceFrom = (overrides: Record<string, string | undefined> = {}): AppConfigService =>
  new AppConfigService(parseEnv(validEnv(overrides)));

describe('AppConfigService', () => {
  describe('app', () => {
    it('exposes the application settings', () => {
      const { app } = serviceFrom({ PORT: '4000', API_PREFIX: 'api/v2' });

      expect(app.port).toBe(4000);
      expect(app.apiPrefix).toBe('api/v2');
      expect(app.nodeEnv).toBe('development');
    });

    it('derives isProduction from NODE_ENV', () => {
      expect(serviceFrom().app.isProduction).toBe(false);
      expect(
        serviceFrom({ NODE_ENV: 'production', CORS_ORIGINS: 'https://ustogo.app' }).app
          .isProduction,
      ).toBe(true);
    });

    it('splits CORS_ORIGINS into a trimmed list', () => {
      const { app } = serviceFrom({ CORS_ORIGINS: 'https://a.app, https://b.app ,' });

      expect(app.corsOrigins).toEqual(['https://a.app', 'https://b.app']);
    });

    it('yields an empty origin list when CORS_ORIGINS is unset', () => {
      expect(serviceFrom().app.corsOrigins).toEqual([]);
    });

    it('collapses an unset SENTRY_DSN to null', () => {
      expect(serviceFrom().app.sentryDsn).toBeNull();
      expect(serviceFrom({ SENTRY_DSN: 'https://key@sentry.io/1' }).app.sentryDsn).toBe(
        'https://key@sentry.io/1',
      );
    });
  });

  describe('grouping', () => {
    it('maps each environment variable into its own group', () => {
      const config = serviceFrom();

      expect(config.database.poolSize).toBe(20);
      expect(config.jwt.accessTtl).toBe('15m');
      expect(config.jwt.bcryptRounds).toBe(12);
      expect(config.storage.bucket).toBe('ustogo-local');
      expect(config.storage.presignTtlSeconds).toBe(900);
      expect(config.mail.host).toBe('localhost');
      expect(config.redis.url).toBe('redis://localhost:6379');
      expect(config.throttle.limit).toBe(100);
      expect(config.throttle.ttlSeconds).toBe(60);
    });

    it('collapses absent mail credentials to null', () => {
      const anonymous = serviceFrom();

      expect(anonymous.mail.user).toBeNull();
      expect(anonymous.mail.password).toBeNull();
    });

    it('keeps mail credentials when they are supplied', () => {
      const authenticated = serviceFrom({ MAIL_USER: 'postmaster', MAIL_PASSWORD: 'hunter2' });

      expect(authenticated.mail.user).toBe('postmaster');
      expect(authenticated.mail.password).toBe('hunter2');
    });
  });

  describe('immutability', () => {
    it('freezes the service and every group', () => {
      const config = serviceFrom();

      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.app)).toBe(true);
      expect(Object.isFrozen(config.jwt)).toBe(true);
      expect(Object.isFrozen(config.storage)).toBe(true);
    });
  });
});
