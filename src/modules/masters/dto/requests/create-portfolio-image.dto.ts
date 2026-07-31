import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePortfolioImageDto {
  @ApiProperty({ format: 'uuid', description: 'A confirmed File with purpose PORTFOLIO_IMAGE.' })
  @IsUUID('4')
  fileId!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
