import { ApiProperty } from '@nestjs/swagger';
import type { District } from '@prisma/client';

import type { Locale } from '@common/utils/locale.util';

export class DistrictResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Sino' }) name!: string;
  @ApiProperty({ example: 'sino' }) slug!: string;

  /** `name` is already Tajik (the source data); only `ru` has a distinct override. */
  static fromEntity(district: District, locale: Locale = 'en'): DistrictResponseDto {
    return {
      id: district.id,
      name: locale === 'ru' ? (district.nameRu ?? district.name) : district.name,
      slug: district.slug,
    };
  }
}
