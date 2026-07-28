import type { Config } from 'jest';

// Coverage thresholds are raised to the levels in docs/TESTING.md §3 as the components
// they guard land; see TODO.md §1.10.
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
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/**/dto/**',
    '!src/**/constants/**',
    '!src/**/__tests__/**',
    '!src/main.ts',
    // Boot wiring over the filesystem and process.env. A unit test would have to assert
    // against whichever .env happens to exist on the machine running it, which is the
    // definition of a flaky test (TESTING.md §10). Its behaviour is covered by the
    // startup path instead; the parsing it delegates to is covered exhaustively.
    '!src/config/load-env.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  testEnvironment: 'node',
  clearMocks: true,
};

export default config;
