import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const LABEL_NAMES = ['method', 'route', 'status'] as const;

/** NFR-O-4 / DEPLOYMENT.md §8 — request rate, error rate and latency, scraped at `GET /metrics`. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequestsTotal: Counter<(typeof LABEL_NAMES)[number]>;
  private readonly httpRequestDuration: Histogram<(typeof LABEL_NAMES)[number]>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests, by method, route and status code.',
      labelNames: LABEL_NAMES,
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds, by method, route and status code.',
      labelNames: LABEL_NAMES,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  recordRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSeconds);
  }
}
