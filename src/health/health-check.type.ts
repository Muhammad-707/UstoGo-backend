export type HealthStatus = 'up' | 'down';

export type HealthCheckResult = {
  readonly name: string;
  readonly status: HealthStatus;
  readonly latencyMs: number;
  /** Present only when the check failed. Never carries a connection string or credential. */
  readonly reason?: string;
};

/**
 * A single dependency probe. Implementations never throw: a readiness endpoint that
 * fails because one of its checks threw tells an operator nothing about the other
 * dependencies, which is the one thing the endpoint exists to report.
 */
export interface HealthIndicator {
  readonly name: string;
  check(): Promise<HealthCheckResult>;
}

/** Probes are bounded so a hung dependency cannot hang the probe that reports it. */
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
