import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  BookingNotFoundException,
  CompletionCertificateNotFoundException,
} from '../../exceptions/bookings.exceptions';
import { CompletionCertificateService } from '../completion-certificate.service';

const BOOKING_ROW = {
  bookingNumber: 'UG-2026-000123',
  serviceTitle: 'Sink repair',
  completedAt: new Date('2026-08-01T00:00:00.000Z'),
  masterProfile: { displayName: 'Bob', user: { id: 'master-user-1' } },
  clientProfile: { firstName: 'Alice', lastName: 'Smith', user: { id: 'client-user-1' } },
  certificate: {
    verificationCode: 'AAAA-BBBB-CCCC',
    issuedAt: new Date('2026-08-01T00:05:00.000Z'),
  },
};

const build = (
  overrides: {
    booking?: Partial<Record<string, jest.Mock>>;
    completionCertificate?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      booking: {
        findUnique: jest.fn().mockResolvedValue(BOOKING_ROW),
        ...overrides.booking,
      },
      completionCertificate: {
        findUnique: jest.fn().mockResolvedValue({
          verificationCode: 'AAAA-BBBB-CCCC',
          issuedAt: BOOKING_ROW.certificate.issuedAt,
          booking: BOOKING_ROW,
        }),
        ...overrides.completionCertificate,
      },
    },
  } as unknown as PrismaService;

  return { service: new CompletionCertificateService(prisma), prisma };
};

describe('CompletionCertificateService.getForBooking', () => {
  it('throws BookingNotFoundException for a non-participant', async () => {
    const { service } = build();

    await expect(
      service.getForBooking({ id: 'stranger', role: 'CLIENT' }, 'booking-1'),
    ).rejects.toThrow(BookingNotFoundException);
  });

  it('throws CompletionCertificateNotFoundException when the booking has no certificate yet', async () => {
    const { service } = build({
      booking: { findUnique: jest.fn().mockResolvedValue({ ...BOOKING_ROW, certificate: null }) },
    });

    await expect(
      service.getForBooking({ id: 'client-user-1', role: 'CLIENT' }, 'booking-1'),
    ).rejects.toThrow(CompletionCertificateNotFoundException);
  });

  it('returns the certificate for a participant', async () => {
    const { service } = build();

    const result = await service.getForBooking(
      { id: 'client-user-1', role: 'CLIENT' },
      'booking-1',
    );

    expect(result.verificationCode).toBe('AAAA-BBBB-CCCC');
    expect(result.bookingNumber).toBe('UG-2026-000123');
  });
});

describe('CompletionCertificateService.verify', () => {
  it('throws CompletionCertificateNotFoundException for an unknown code', async () => {
    const { service } = build({
      completionCertificate: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.verify('ghost')).rejects.toThrow(CompletionCertificateNotFoundException);
  });

  it('returns the completion facts for a known code — no auth required', async () => {
    const { service } = build();

    const result = await service.verify('AAAA-BBBB-CCCC');

    expect(result.masterDisplayName).toBe('Bob');
    expect(result.clientName).toBe('Alice Smith');
  });
});
