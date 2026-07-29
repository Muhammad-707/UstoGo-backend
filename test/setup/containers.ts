import type { StartedTestContainer } from 'testcontainers';

export type StartedContainers = {
  readonly postgres: StartedTestContainer;
  readonly minio: StartedTestContainer;
  readonly redis: StartedTestContainer;
};

/**
 * Handles on the running containers, shared between global setup and teardown.
 *
 * Jest runs both hooks in the same process but does not thread a value between them,
 * and module state does not survive because each hook is loaded fresh. `globalThis` is
 * the one place both can reach.
 */
const KEY = Symbol.for('ustogo.e2e.containers');

type Holder = { [KEY]?: StartedContainers };

export const registerContainers = (containers: StartedContainers): void => {
  (globalThis as Holder)[KEY] = containers;
};

export const startedContainers = (): StartedContainers | undefined => (globalThis as Holder)[KEY];
