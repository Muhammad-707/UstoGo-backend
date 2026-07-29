import { execFileSync } from 'node:child_process';

import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';

import { registerContainers } from './containers';

const BUCKET = 'ustogo-e2e';
const MINIO_USER = 'minioadmin';
const MINIO_PASSWORD = 'minioadmin';

/**
 * Starts the real dependencies once for the whole suite (`TESTING.md` §2).
 *
 * PostgreSQL is a container rather than the compose stack so a test run cannot depend
 * on, or corrupt, whatever the developer has running — and so CI needs no service
 * definition. The version is pinned to production's: SQLite and "any PostgreSQL" both
 * fail to prove anything about `citext`, exclusion constraints or transaction
 * semantics, which is the whole reason integration tests exist here.
 *
 * Variables are written into `process.env`, which Jest passes to every worker.
 * `loadEnv()` lets an existing value win over `.env`, so the application under test
 * reads these and never the developer's local stack.
 */
export default async function globalSetup(): Promise<void> {
  const postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('ustogo_test')
    .withUsername('ustogo')
    .withPassword('ustogo')
    .start();

  const minio = await new GenericContainer('minio/minio:latest')
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: MINIO_USER,
      MINIO_ROOT_PASSWORD: MINIO_PASSWORD,
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
    .start();

  const databaseUrl = postgres.getConnectionUri();
  const s3Endpoint = `http://${minio.getHost()}:${String(minio.getMappedPort(9000))}`;

  registerContainers({ postgres, minio });

  // `migrate deploy`, not `db push`: the migrations are the artefact that will run
  // against production, so a test suite that bypassed them would leave the one thing
  // most worth checking untested.
  const prismaEnv = { ...process.env, DATABASE_URL: databaseUrl };

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: prismaEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  // Cities are reference data the fixtures depend on, seeded once and never truncated
  // between tests.
  execFileSync('npx', ['prisma', 'db', 'seed'], {
    env: prismaEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: s3Endpoint,
    credentials: { accessKeyId: MINIO_USER, secretAccessKey: MINIO_PASSWORD },
    forcePathStyle: true,
  });

  // The application assumes its bucket exists, because in production the bucket is
  // provisioned by infrastructure rather than by the API's credentials.
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  s3.destroy();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    S3_ENDPOINT: s3Endpoint,
    S3_REGION: 'us-east-1',
    S3_BUCKET: BUCKET,
    S3_ACCESS_KEY_ID: MINIO_USER,
    S3_SECRET_ACCESS_KEY: MINIO_PASSWORD,
    // Swagger and the scheduler are boot-time weight with no bearing on any assertion,
    // and a cron firing mid-suite would delete rows a test is still using.
    SWAGGER_ENABLED: 'false',
    // The lowest cost the schema permits, not the lowest bcrypt accepts: the floor of
    // 10 is a security decision, and a test environment that opted out of it would be
    // proving the application works in a configuration it must never run in. Fixtures
    // hash a great many passwords, so the difference from production's 12 is worth
    // taking — the cost itself is asserted in the unit tests for PasswordService.
    BCRYPT_ROUNDS: '10',
  });
}
