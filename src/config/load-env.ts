import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseEnv, type Env } from './env.schema';

const ENV_FILE = '.env';

let cached: Env | undefined;

/**
 * Reads and validates the process environment.
 *
 * A `.env` file is a developer convenience only. In every deployed environment the
 * variables come from the orchestrator or a secret manager (`DEPLOYMENT.md` §3), and
 * an image that shipped a `.env` would be a finding, not a feature — so a missing file
 * is normal and never an error. Real values already in `process.env` win, because that
 * is what an operator overriding a single variable expects.
 *
 * Memoised so that `main.ts` can validate before Nest is constructed and `ConfigModule`
 * can resolve the same object afterwards, without parsing the environment twice.
 */
export const loadEnv = (): Env => {
  if (cached !== undefined) {
    return cached;
  }

  const envFile = resolve(process.cwd(), ENV_FILE);

  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  cached = parseEnv(process.env);
  return cached;
};
