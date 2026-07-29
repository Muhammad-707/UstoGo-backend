import type { Config } from 'jest';

import unit, { COVERAGE_SOURCES } from './jest.config';
import e2e from './jest.e2e.config';

/**
 * Both levels in one run, so coverage is measured across all of them (`TESTING.md` §3).
 *
 * The thresholds live here rather than in `jest.config.ts` because a controller is
 * covered by the e2e suite and by nothing else. Enforcing a global floor against the
 * unit run alone would report a controller as untested when it is thoroughly tested,
 * and the usual response to that — excluding controllers from coverage — hides the one
 * layer where an authorization mistake is most expensive.
 *
 * Jest merges coverage across projects natively, which is why this is a `projects`
 * config rather than two runs and a report merge.
 */
const config: Config = {
  rootDir: '.',
  projects: [
    { displayName: 'unit', ...unit },
    { displayName: 'e2e', ...e2e },
  ],
  collectCoverageFrom: COVERAGE_SOURCES,
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    // `TESTING.md` §3 sets the floor at 80% lines. These sit above it, close to what
    // the suite actually reaches, because a threshold far below reality ratchets
    // nothing — coverage can fall fifteen points before anyone is told.
    //
    // `global` here means "everything not claimed by a pattern below" — Jest removes
    // matched files from the global pool. The whole-project branch figure is higher
    // than this number; what is left after the services and guards are accounted for
    // is mostly error-mapping code with many arms.
    global: {
      lines: 90,
      statements: 90,
      branches: 78,
    },
    // The bars that matter most sit on the components where a bug is expensive
    // (TESTING.md §3). `BookingStateMachine` and `AvailabilityCalculator` join this
    // list with Phases 4 and 3; `AuthService` reaches 100% branches with TODO §1.7.
    'src/modules/auth/services/token.service.ts': { branches: 100 },
    'src/modules/auth/services/password-reset.service.ts': { branches: 100 },
    'src/common/guards/roles.guard.ts': { branches: 100 },
    'src/modules/**/services/*.ts': { lines: 90 },
    'src/common/guards/*.ts': { lines: 90 },
    'src/common/interceptors/*.ts': { lines: 90 },
  },
};

export default config;
