import http from 'k6/http';
import { check } from 'k6';

/**
 * ROADMAP.md Phase 3 exit criterion NFR-P-5: availability computation performance.
 * Needs a seeded, approved, active master with a weekly schedule — pass its id and one
 * of its active service ids as env vars; the script does not create fixtures.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000/api/v1 \
 *          -e MASTER_ID=<uuid> -e SERVICE_ID=<uuid> k6/availability.js
 */
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000/api/v1';
const MASTER_ID = __ENV.MASTER_ID;
const SERVICE_ID = __ENV.SERVICE_ID;

const today = new Date();
const from = today.toISOString().slice(0, 10);
const to = new Date(today.getTime() + 27 * 86_400_000).toISOString().slice(0, 10);

export default function run() {
  const res = http.get(
    `${BASE_URL}/masters/${MASTER_ID}/availability?from=${from}&to=${to}&serviceId=${SERVICE_ID}`,
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'body is an array': (r) => Array.isArray(JSON.parse(r.body)),
  });
}
