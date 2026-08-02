import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';

/** API.md §12 — admin-only projection: unlike `MasterPublicResponseDto`, contact details are included. */
export class AdminMasterListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiProperty()
  cityName!: string;

  @ApiProperty({ type: String, isArray: true })
  categories!: string[];

  @ApiProperty({ enum: ApprovalStatus })
  approvalStatus!: ApprovalStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  ratingAverage!: string;

  @ApiProperty()
  ratingCount!: number;

  @ApiPropertyOptional({ nullable: true, description: 'The lowest active service price.' })
  priceFrom!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ example: 42 })
  completedBookingsCount!: number;

  @ApiProperty({
    example: '3400.00',
    description: 'Sum of price for all COMPLETED bookings, ever.',
  })
  totalEarnings!: string;
}
