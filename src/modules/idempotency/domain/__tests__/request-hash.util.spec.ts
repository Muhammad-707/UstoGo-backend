import { hashRequest } from '../request-hash.util';

describe('hashRequest', () => {
  it('is deterministic for the same method, path and body', () => {
    const a = hashRequest('POST', '/api/v1/bookings', { serviceId: 's1' });
    const b = hashRequest('POST', '/api/v1/bookings', { serviceId: 's1' });

    expect(a).toBe(b);
  });

  it('differs when the body differs', () => {
    const a = hashRequest('POST', '/api/v1/bookings', { serviceId: 's1' });
    const b = hashRequest('POST', '/api/v1/bookings', { serviceId: 's2' });

    expect(a).not.toBe(b);
  });

  it('differs when the path differs', () => {
    const a = hashRequest('POST', '/api/v1/bookings', { serviceId: 's1' });
    const b = hashRequest('POST', '/api/v1/reviews', { serviceId: 's1' });

    expect(a).not.toBe(b);
  });

  it('treats a missing body the same as an empty object', () => {
    const a = hashRequest('POST', '/api/v1/bookings', undefined);
    const b = hashRequest('POST', '/api/v1/bookings', {});

    expect(a).toBe(b);
  });
});
