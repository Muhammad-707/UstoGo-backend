import type { Config } from 'jest';

/**
 * End-to-end suite: full HTTP through a booted application against containerised
 * PostgreSQL and MinIO (`TESTING.md` §6).
 *
 * Separate from `jest.config.ts` so `npm test` stays a fast, Docker-free feedback loop.
 * Merging them would make every unit run pay the container startup, and a developer
 * without Docker could not run the unit tests at all.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@prisma-lib/(.*)$': '<rootDir>/src/prisma/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  testEnvironment: 'node',
  clearMocks: true,
  // Pulling images and starting containers is minutes on a cold cache, seconds after.
  testTimeout: 60_000,
  // One worker: the suites share one database, and truncation between tests would race
  // across workers. Isolation by schema per worker is the upgrade path if this becomes
  // the bottleneck.
  maxWorkers: 1,
  // Nest's shutdown is asynchronous; without this an open handle warning appears after
  // a suite that passed, which reads like a failure and is not one.
  forceExit: true,
};

export default config;
