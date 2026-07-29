import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { City } from '@prisma/client';

export class CityResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Tashkent' }) name!: string;
  @ApiProperty({ example: 'tashkent' }) slug!: string;
  @ApiPropertyOptional({ nullable: true, example: 'Tashkent' }) region!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '41.299500', description: 'Decimal as string' })
  latitude!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '69.240100' })
  longitude!: string | null;

  static fromEntity(city: City): CityResponseDto {
    return {
      id: city.id,
      name: city.name,
      slug: city.slug,
      region: city.region,
      latitude: city.latitude?.toString() ?? null,
      longitude: city.longitude?.toString() ?? null,
    };
  }
}
