import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  it('exposes recorded requests through the registry in Prometheus text format', async () => {
    const service = new MetricsService();

    service.recordRequest('GET', '/api/v1/bookings/:id', 200, 0.123);

    const output = await service.registry.metrics();

    expect(output).toContain(
      'http_requests_total{method="GET",route="/api/v1/bookings/:id",status="200"} 1',
    );
    expect(output).toContain('http_request_duration_seconds');
  });
});
