import { ApiProperty } from '@nestjs/swagger';
import type { District } from '@prisma/client';

export class DistrictResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Sino' }) name!: string;
  @ApiProperty({ example: 'sino' }) slug!: string;

  static fromEntity(district: District): DistrictResponseDto {
    return {
      id: district.id,
      name: district.name,
      slug: district.slug,
    };
  }
}
