import http from 'k6/http';
import { check } from 'k6';

/**
 * NFR-P-1: p95 <= 200ms for simple reads (profile, single booking, notification list)
 * under 100 rps. Needs a logged-in user's access token and one of their own booking ids
 * — the script does not create fixtures or authenticate.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000/api/v1 \
 *          -e TOKEN=<access_token> -e BOOKING_ID=<uuid> k6/simple-reads.js
 */
export const options = {
  scenarios: {
    simpleReads: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = __ENV.TOKEN;
const BOOKING_ID = __ENV.BOOKING_ID;

const headers = { Authorization: `Bearer ${TOKEN}` };

const ENDPOINTS = [
  () => http.get(`${BASE_URL}/users/me`, { headers }),
  () => http.get(`${BASE_URL}/bookings/${BOOKING_ID}`, { headers }),
  () => http.get(`${BASE_URL}/notifications`, { headers }),
];

export default function run() {
  const request = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const res = request();

  check(res, { 'status is 200': (r) => r.status === 200 });
}
