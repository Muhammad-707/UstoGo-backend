import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AttachCategoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId!: string;
}
