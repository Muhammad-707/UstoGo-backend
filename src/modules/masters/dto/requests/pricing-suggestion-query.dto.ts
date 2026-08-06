import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** `GET /masters/me/pricing-suggestion`. */
export class PricingSuggestionQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId!: string;
}
