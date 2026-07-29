import { startedContainers } from './containers';

/**
 * Stops the containers the suite started.
 *
 * Testcontainers' Ryuk sidecar reaps them anyway if the process dies, but only after a
 * timeout — stopping them explicitly keeps a developer's Docker from accumulating a
 * database per test run.
 */
export default async function globalTeardown(): Promise<void> {
  const containers = startedContainers();

  if (containers === undefined) {
    return;
  }

  await Promise.all([containers.minio.stop(), containers.postgres.stop()]);
}
