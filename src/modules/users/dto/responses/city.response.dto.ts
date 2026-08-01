import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { City, District } from '@prisma/client';

import { DistrictResponseDto } from './district.response.dto';

export type CityWithDistricts = City & { districts?: District[] };

export class CityResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Tashkent' }) name!: string;
  @ApiProperty({ example: 'tashkent' }) slug!: string;
  @ApiPropertyOptional({ nullable: true, example: 'Tashkent' }) region!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '41.299500', description: 'Decimal as string' })
  latitude!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '69.240100' })
  longitude!: string | null;

  @ApiProperty({
    type: DistrictResponseDto,
    isArray: true,
    description: 'Internal sub-divisions of the city (districts / jamoats).',
  })
  districts!: DistrictResponseDto[];

  static fromEntity(city: CityWithDistricts): CityResponseDto {
    return {
      id: city.id,
      name: city.name,
      slug: city.slug,
      region: city.region,
      latitude: city.latitude?.toString() ?? null,
      longitude: city.longitude?.toString() ?? null,
      districts: (city.districts ?? [])
        .filter((district) => district.isActive)
        .map((district) => DistrictResponseDto.fromEntity(district)),
    };
  }
}
