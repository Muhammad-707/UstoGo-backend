import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsUUID } from 'class-validator';

export class ReorderPortfolioDto {
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Every one of the caller’s portfolio image ids, in the desired display order.',
  })
  @IsUUID('4', { each: true })
  @ArrayUnique()
  imageIds!: string[];
}
