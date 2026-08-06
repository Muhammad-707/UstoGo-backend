import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PricingSuggestionResponseDto {
  @ApiProperty({
    enum: ['CITY', 'CATEGORY_WIDE'],
    description:
      'CITY when the master’s own city has enough active listings; falls back otherwise.',
  })
  basis!: 'CITY' | 'CATEGORY_WIDE';

  @ApiProperty({ description: 'Active services this suggestion is drawn from.' })
  sampleSize!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Cheapest active listing in the sample.' })
  suggestedMin!: string | null;

  @ApiPropertyOptional({ nullable: true })
  suggestedMedian!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Priciest active listing in the sample.' })
  suggestedMax!: string | null;
}
