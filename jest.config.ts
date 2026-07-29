import type { Config } from 'jest';

/**
 * What coverage is measured over. Shared with `jest.all.config.ts`, which runs both
 * levels together and is where the thresholds from `TESTING.md` §3 are enforced.
 *
 * The exclusions follow `TESTING.md` §9: module files, DTOs and constants carry no
 * logic, so covering them produces a percentage and no confidence.
 */
export const COVERAGE_SOURCES = [
  'src/**/*.ts',
  '!src/**/*.module.ts',
  '!src/**/dto/**',
  '!src/**/constants/**',
  '!src/**/__tests__/**',
  '!src/**/index.ts',
  '!src/main.ts',
  // Boot wiring over the filesystem and process.env. A unit test would have to assert
  // against whichever .env happens to exist on the machine running it, which is the
  // definition of a flaky test (TESTING.md §10). Its behaviour is covered by the
  // startup path instead; the parsing it delegates to is covered exhaustively.
  '!src/config/load-env.ts',
  // Bootstrap and the CLI entry point are wiring executed once at startup, and the
  // OpenAPI exporter is a build tool. The same reasoning as load-env.ts: what they
  // assemble is covered where it does its work.
  '!src/bootstrap/**',
  '!src/cli/main.cli.ts',
  // Raw terminal I/O — muting stdout and reading keystrokes. It exists precisely so
  // the command can be tested without a TTY, and a test for it would have to fake the
  // TTY it was written to avoid.
  '!src/cli/prompt.ts',
];

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
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
  collectCoverageFrom: COVERAGE_SOURCES,
  coverageDirectory: '<rootDir>/coverage',
  testEnvironment: 'node',
  clearMocks: true,
};

export default config;
