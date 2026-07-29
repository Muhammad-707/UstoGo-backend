import http from 'k6/http';
import { check } from 'k6';

/**
 * ROADMAP.md Phase 3 exit criterion NFR-P-2: master search p95 <= 500ms over 50,000
 * masters. Run against a stack seeded to that scale, not the dev seed (12 categories,
 * 10 cities and a handful of masters) — this script measures, it does not seed.
 *
 * Usage: k6 run -e BASE_URL=http://localhost:3000/api/v1 k6/search.js
 */
export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000/api/v1';

const QUERIES = [
  '',
  'sort=rating:desc',
  'sort=price:asc',
  'sort=createdAt:desc',
  'minRating=3',
  'hasCertificates=true',
];

export default function run() {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.get(`${BASE_URL}/masters?${query}`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has items array': (r) => Array.isArray(JSON.parse(r.body).items),
  });
}
