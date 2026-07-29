import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceType, type Service } from '@prisma/client';

/** A master's active services, as seen publicly (API.md §7 `GET /masters/:id/services`). */
export class MasterServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: PriceType })
  priceType!: PriceType;

  @ApiProperty()
  price!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  durationMinutes!: number;

  static fromEntity(entity: Service): MasterServiceResponseDto {
    const dto = new MasterServiceResponseDto();

    dto.id = entity.id;
    dto.categoryId = entity.categoryId;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.priceType = entity.priceType;
    dto.price = entity.price.toFixed(2);
    dto.currency = entity.currency;
    dto.durationMinutes = entity.durationMinutes;

    return dto;
  }
}
