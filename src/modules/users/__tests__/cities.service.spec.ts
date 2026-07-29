import type { City } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import { CityResponseDto } from '../dto/responses/city.response.dto';
import { CitiesService } from '../services/cities.service';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const build = () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = { db: { city: { findMany } } } as unknown as PrismaService;

  return { service: new CitiesService(prisma), findMany };
};

describe('CitiesService.listActive', () => {
  it('returns only active cities', async () => {
    const { service, findMany } = build();

    await service.listActive();
    const query = firstArg<{ where: { isActive: boolean } }>(findMany);

    expect(query.where.isActive).toBe(true);
  });

  it('orders by name so the selector is stable', async () => {
    const { service, findMany } = build();

    await service.listActive();
    const query = firstArg<{ orderBy: { name: string } }>(findMany);

    expect(query.orderBy).toEqual({ name: 'asc' });
  });

  // No findMany goes unbounded (CODING_STANDARDS.md §6). The cap is generous because
  // this is reference data, but its absence would be the bug.
  it('is bounded', async () => {
    const { service, findMany } = build();

    await service.listActive();
    const query = firstArg<{ take: number }>(findMany);

    expect(query.take).toBeGreaterThan(0);
  });
});

describe('CityResponseDto.fromEntity', () => {
  const city = (overrides: Partial<City> = {}): City =>
    ({
      id: 'c1',
      name: 'Tashkent',
      slug: 'tashkent',
      region: 'Tashkent',
      latitude: new Prisma.Decimal('41.299500'),
      longitude: new Prisma.Decimal('69.240100'),
      isActive: true,
      ...overrides,
    }) as unknown as City;

  // A coordinate is a fixed-scale decimal; JSON numbers cannot carry that guarantee,
  // and a client that reads it as a float loses precision silently.
  it('serialises coordinates as strings', () => {
    const dto = CityResponseDto.fromEntity(city());

    expect(dto.latitude).toBe('41.2995');
    expect(typeof dto.longitude).toBe('string');
  });

  it('passes null coordinates through', () => {
    const dto = CityResponseDto.fromEntity(city({ latitude: null, longitude: null }));

    expect(dto.latitude).toBeNull();
    expect(dto.longitude).toBeNull();
  });

  it('never exposes isActive — the endpoint already filters on it', () => {
    expect(CityResponseDto.fromEntity(city())).not.toHaveProperty('isActive');
  });
});
