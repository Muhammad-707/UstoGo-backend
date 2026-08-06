import type { PrismaService } from '@prisma-lib/prisma.service';

import type { CreateQuoteDto } from '../../dto/requests/create-quote.dto';
import {
  QuoteAlreadyRespondedException,
  QuoteNotFoundException,
} from '../../exceptions/quotes.exceptions';
import { QuotesService } from '../quotes.service';

const QUOTE_ROW = {
  id: 'quote-1',
  status: 'PENDING',
  masterProfileId: 'mp-1',
  clientProfileId: 'cp-1',
  masterProfile: { displayName: 'Bob', user: { id: 'master-user-1' } },
  clientProfile: { firstName: 'Alice', lastName: 'Smith', user: { id: 'client-user-1' } },
  service: null,
};

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
    quote?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'mp-1', approvalStatus: 'APPROVED', isActive: true }),
        ...overrides.masterProfile,
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: 'svc-1' }),
        ...overrides.service,
      },
      quote: {
        create: jest.fn().mockResolvedValue(QUOTE_ROW),
        update: jest.fn().mockResolvedValue({ ...QUOTE_ROW, status: 'RESPONDED' }),
        findUnique: jest.fn().mockResolvedValue(QUOTE_ROW),
        findFirst: jest.fn().mockResolvedValue(QUOTE_ROW),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        ...overrides.quote,
      },
    },
  } as unknown as PrismaService;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return { service: new QuotesService(prisma, events), prisma, events };
};

const createDto = (): CreateQuoteDto => ({
  masterId: 'mp-1',
  description: 'Kitchen sink is leaking under the cabinet.',
});

describe('QuotesService.create', () => {
  it('throws when the master is unavailable', async () => {
    const { service } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'mp-1', approvalStatus: 'PENDING', isActive: true }),
      },
    });

    await expect(service.create('user-1', createDto())).rejects.toThrow();
  });

  it('creates a quote and emits QUOTE_REQUESTED', async () => {
    const { service, events } = build();

    const quote = await service.create('user-1', createDto());

    expect(quote.id).toBe('quote-1');
    expect(events.emit).toHaveBeenCalledWith('quote.requested', expect.anything());
  });
});

describe('QuotesService.respond', () => {
  it('throws QuoteAlreadyRespondedException for a non-PENDING quote', async () => {
    const { service } = build({
      quote: { findFirst: jest.fn().mockResolvedValue({ ...QUOTE_ROW, status: 'RESPONDED' }) },
    });

    await expect(
      service.respond('master-user-1', 'quote-1', { estimatedPrice: 45, priceType: 'FIXED' }),
    ).rejects.toThrow(QuoteAlreadyRespondedException);
  });

  it('throws QuoteNotFoundException for a foreign quote id', async () => {
    const { service } = build({ quote: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(
      service.respond('master-user-1', 'quote-1', { estimatedPrice: 45, priceType: 'FIXED' }),
    ).rejects.toThrow(QuoteNotFoundException);
  });

  it('responds and emits QUOTE_RESPONDED', async () => {
    const { service, events } = build();

    await service.respond('master-user-1', 'quote-1', { estimatedPrice: 45, priceType: 'FIXED' });

    expect(events.emit).toHaveBeenCalledWith('quote.responded', expect.anything());
  });
});

describe('QuotesService.decline', () => {
  it('declines and emits QUOTE_DECLINED', async () => {
    const { service, events } = build({
      quote: { update: jest.fn().mockResolvedValue({ ...QUOTE_ROW, status: 'DECLINED' }) },
    });

    await service.decline('master-user-1', 'quote-1', {
      reason: 'Too far outside my service area.',
    });

    expect(events.emit).toHaveBeenCalledWith('quote.declined', expect.anything());
  });
});

describe('QuotesService.getForCaller', () => {
  it('returns the quote for a participant', async () => {
    const { service } = build();

    const quote = await service.getForCaller({ id: 'client-user-1', role: 'CLIENT' }, 'quote-1');

    expect(quote.id).toBe('quote-1');
  });

  it('throws for a non-participant', async () => {
    const { service } = build();

    await expect(
      service.getForCaller({ id: 'stranger', role: 'CLIENT' }, 'quote-1'),
    ).rejects.toThrow(QuoteNotFoundException);
  });
});
